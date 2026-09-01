import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.id = "";
    this.textContent = "";
    this.dataset = {};
    this.style = {
      setProperty(name, value) {
        this[name] = value;
      },
    };
    this.listeners = {};
    this.classList = { add: (...names) => {
      this.className = [this.className, ...names].filter(Boolean).join(" ");
    } };
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  removeAttribute(name) {
    delete this[name];
  }
}

const documentElement = new FakeElement("documentElement");
const doc = {
  documentElement,
  createElement: (tagName) => new FakeElement(tagName),
  createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  createTextNode: (text) => Object.assign(new FakeElement("#text"), { textContent: text }),
  getElementById: (id) => documentElement.children.find((child) => child.id === id) || null,
};
const body = new FakeElement("body");
body.ownerDocument = doc;

const source = await readFile(new URL("../bootstrap.js", import.meta.url), "utf8");
const icon = await readFile(new URL("../icons/codex.svg", import.meta.url), "utf8");
const prefs = new Map();
const context = vm.createContext({
  Components: { classes: {}, interfaces: {} },
  Zotero: {
    Prefs: {
      get: (key) => prefs.get(key),
      set: (key, value) => prefs.set(key, value),
    },
    Fulltext: null,
    getTempDirectory: () => ({ path: "/tmp" }),
    debug: () => {},
    logError: () => {},
  },
  console,
  setTimeout,
  clearTimeout,
});
vm.runInContext(`${source}
  ensureAppServer = async () => ({
    account: { type: "chatgpt" },
    requiresOpenaiAuth: false,
    request: async (method) => {
      if (method === "model/list") return {
        data: [
          {
            id: "gpt-5.3-codex-spark",
            displayName: "GPT-5.3-Codex-Spark",
            isDefault: true,
            defaultReasoningEffort: "low",
            supportedReasoningEfforts: [{ reasoningEffort: "low" }],
          },
          {
            id: "gpt-test",
            displayName: "GPT Test",
            defaultReasoningEffort: "low",
            supportedReasoningEfforts: [
              { reasoningEffort: "low" },
              { reasoningEffort: "high" },
            ],
            serviceTiers: [{ id: "priority", name: "Fast", description: "1.5x speed" }],
          },
        ],
      };
      if (method === "account/rateLimits/read") return {
        rateLimits: {
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 2000 },
          secondary: { usedPercent: 50, windowDurationMins: 10080, resetsAt: 3000 },
        },
      };
      if (method === "thread/list") return { data: [], nextCursor: null };
      return { thread: { turns: [] } };
    },
  });
  globalThis.renderPanelShellForTest = renderPanelShell;
  globalThis.renderPanelForTest = renderPanel;
  globalThis.renderConversationHistoryForTest = renderConversationHistory;
  globalThis.renderReaderSelectionActionForTest = renderReaderSelectionAction;
  globalThis.queuePDFSelectionForTest = queuePDFSelection;
  globalThis.createCollectionShellContextForTest = createCollectionShellContext;
  globalThis.enforceIconOnlyPaneChromeForTest = enforceIconOnlyPaneChrome;
  globalThis.getPanelSessionForTest = () => [...sessions.values()][0];
  globalThis.setUILanguageForTest = (language) => {
    setPref(UI_LANGUAGE_PREF, language);
    for (const session of sessions.values()) notifySession(session);
  };
`, context);

context.renderPanelShellForTest({ body, doc });

assert.equal(body.children.length, 1);
assert.equal(body.children[0].className, "zcs-root zcs-loading");
assert.equal(body.children[0].textContent, "正在载入当前论文…");
assert.match(documentElement.children[0].textContent, /\.zcs-loading \{ min-height: 156px/);

let attachmentReads = 0;
let abstractReads = 0;
const item = {
  id: 42,
  key: "UI-SMOKE",
  libraryID: 1,
  isAttachment: () => false,
  isNote: () => false,
  isAnnotation: () => false,
  getBestAttachment: async () => {
    attachmentReads += 1;
    return null;
  },
  getCreators: () => [{ firstName: "Test", lastName: "Author" }],
  getField: (field) => {
    if (field === "abstractNote") abstractReads += 1;
    return ({
      title: "Codex UI Smoke Test",
      abstractNote: "A short abstract used to render the conversation composer.",
    })[field] || "";
  },
};

await context.renderPanelForTest({ body, doc, item });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(attachmentReads, 0);
assert.equal(abstractReads, 0);

function find(element, predicate) {
  if (predicate(element)) return element;
  for (const child of element.children || []) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

assert.ok(find(body, (element) => element.tagName === "textarea" && element.className === "zcs-input"));
assert.ok(find(body, (element) =>
  element.tagName === "button"
  && element.className.includes("zcs-send")
  && element.textContent === "↑"
));
assert.ok(find(body, (element) =>
  element.tagName === "button"
  && element.className.includes("zcs-folder-button")
  && element.textContent === ""
));
assert.ok(find(body, (element) =>
  element.tagName === "span"
  && element.className === "zcs-plus-glyph"
  && element.textContent === "+"
));
assert.equal(find(body, (element) => element.className === "zcs-mark"), null);
assert.equal(find(body, (element) => element.className === "zcs-eyebrow"), null);
assert.ok(find(body, (element) => element.tagName === "select" && element.value === "gpt-test"));
assert.equal(find(body, (element) => element.textContent === "GPT-5.3-Codex-Spark"), null);
assert.ok(find(body, (element) => element.tagName === "select" && element.value === "low"));
assert.ok(find(body, (element) =>
  element.tagName === "select"
  && element.className.includes("zcs-speed-select")
  && element.value === "default"
));
assert.ok(find(body, (element) => element.tagName === "option" && element.textContent === "标准"));
assert.ok(find(body, (element) => element.tagName === "option" && element.textContent === "快速"));
const composer = find(body, (element) => element.className === "zcs-composer");
const modelControls = find(composer, (element) => element.className === "zcs-model-controls");
assert.ok(modelControls);
assert.ok(find(modelControls, (element) =>
  element.className === "zcs-quota-item"
  && element.textContent === "周 50%"
));
assert.equal(find(composer, (element) => element.textContent === "模型"), null);
assert.equal(find(composer, (element) => element.textContent === "推理"), null);
assert.equal(find(body, (element) => element.className === "zcs-quota-item" && element.textContent === "5h 75%"), null);
assert.ok(find(body, (element) => element.className === "zcs-quota-item" && element.textContent === "周 50%"));
assert.equal(find(body, (element) => element.className === "zcs-quota-label"), null);
assert.equal(find(body, (element) => element.className === "zcs-privacy"), null);
assert.ok(find(body, (element) => element.textContent === "调研相关论文"));
assert.ok(find(body, (element) => element.textContent === "积小成巨"));
const login = find(body, (element) => element.className === "zcs-link-button");
assert.equal(login.hidden, true);
const renderedRoot = find(body, (element) => element.className === "zcs-root");
assert.equal(renderedRoot.style["--zcs-chat-font-size"], "12px");
assert.match(documentElement.children[0].textContent, /\.zcs-message \{[^}]*border: 0;/);
assert.match(documentElement.children[0].textContent, /\.zcs-message-assistant, \.zcs-message-reasoning \{[^}]*align-self: flex-start;[^}]*box-sizing: border-box;[^}]*width: 91%;[^}]*max-width: 91%;/);
assert.match(documentElement.children[0].textContent, /\.zcs-chip \{[^}]*border: 0;/);
assert.match(documentElement.children[0].textContent, /\.zcs-composer:focus-within \{[^}]*var\(--zcs-accent\)/);
assert.match(documentElement.children[0].textContent, /\.zcs-input:focus, \.zcs-input:focus-visible \{[^}]*outline: 0 !important;[^}]*box-shadow: none !important;/);
assert.match(documentElement.children[0].textContent, /\.zcs-composer \{[^}]*grid-template-rows: minmax\(48px, auto\) 27px;/);
assert.match(documentElement.children[0].textContent, /\.zcs-history-menu \{[^}]*gap: 6px;[^}]*padding: 6px;/);
assert.match(documentElement.children[0].textContent, /\.zcs-history-menu-item \{[^}]*border: 0;[^}]*border-radius: calc\(var\(--zcs-radius-panel\) - 5px\);/);
assert.match(documentElement.children[0].textContent, /\.zcs-rename \{[^}]*column-gap: 10px;/);
assert.match(documentElement.children[0].textContent, /\.zcs-model-controls \{[^}]*overflow: visible;/);
assert.match(documentElement.children[0].textContent, /\.zcs-select \{[^}]*border-radius: var\(--zcs-radius-control\);[^}]*appearance: none;/);
assert.match(documentElement.children[0].textContent, /\.zcs-select:hover, \.zcs-select:focus \{[^}]*var\(--zcs-accent\) 11%/);
assert.match(documentElement.children[0].textContent, /\.zcs-suggestions \{[^}]*margin-bottom: 0;/);
assert.match(documentElement.children[0].textContent, /\.zcs-selection-slot:empty \{ display: none; \}/);
assert.match(documentElement.children[0].textContent, /\.zcs-model-select \{[^}]*width: 108px;[^}]*max-width: min\(38%, 108px\);/);
assert.match(documentElement.children[0].textContent, /\.zcs-empty-title \{[^}]*color: var\(--zcs-accent-strong\);/);
assert.match(documentElement.children[0].textContent, /\.zcs-empty-title \{[^}]*font-size: 17px;/);
assert.equal(source.includes('session.busy ? "■" : "↑"'), false);

const panelSession = context.getPanelSessionForTest();
panelSession.busy = true;
panelSession.activeThinking = { role: "reasoning", text: "正在核对方法与实验结果" };
panelSession.activeAssistant = { role: "assistant", text: "" };
panelSession.messages = [panelSession.activeThinking, panelSession.activeAssistant];
for (const listener of panelSession.listeners) listener();
assert.ok(find(body, (element) =>
  element.className === "zcs-reasoning-body"
  && element.textContent === "正在核对方法与实验结果"
));
assert.ok(find(body, (element) =>
  element.className === "zcs-reasoning-dot"
  && element.dataset.active === "true"
));
const activeReasoningDetails = find(body, (element) =>
  element.tagName === "details"
  && element.className.includes("zcs-message-reasoning")
);
assert.equal(activeReasoningDetails.open, true);
assert.equal(find(body, (element) => element.className.includes("zcs-message-assistant")), null);

const sidenavButton = new FakeElement("div");
sidenavButton.dataset.pane = "cortex@yicheng-fu.github.io-zotero-codex-chat";
sidenavButton.dataset.l10nId = "zotero-codex-sidebar-tooltip";
sidenavButton.children = [Object.assign(new FakeElement("span"), { textContent: "Cortex" })];
const sidenav = { querySelectorAll: () => [sidenavButton] };
const section = new FakeElement("collapsible-section");
section.label = "Cortex";
section.dataset.l10nId = "zotero-codex-sidebar-header";
const pane = {
  dataset: { pane: "cortex@yicheng-fu.github.io-zotero-codex-chat" },
  querySelector: () => section,
};
context.enforceIconOnlyPaneChromeForTest({
  querySelectorAll: (selector) => selector === "item-pane-sidenav" ? [sidenav] : [pane],
});
assert.equal(sidenavButton.children.length, 0);
assert.equal(sidenavButton.dataset.l10nId, undefined);
assert.notEqual(section.label, "Cortex");

const popupActions = [];
context.renderReaderSelectionActionForTest({
  reader: { itemID: 42 },
  doc,
  params: { annotation: { text: "Selected sentence from the PDF." } },
  append: (element) => popupActions.push(element),
});
assert.equal(popupActions.length, 1);
assert.equal(popupActions[0].textContent, "＋ Codex");
assert.match(icon, /M14\.5 10\.4a2\.8 2\.8 0 1 0 0 4\.4/);
assert.doesNotMatch(icon, /M9\.2 9\.5h5\.6/);

const selectionSession = {
  pendingSelections: [],
  listeners: new Set(),
  error: "",
  status: "",
};
assert.equal(context.queuePDFSelectionForTest(selectionSession, "  A selected sentence.  "), true);
assert.deepEqual([...selectionSession.pendingSelections], ["A selected sentence."]);

const history = context.renderConversationHistoryForTest(doc, {
  context: { title: "Codex UI Smoke Test" },
  threadId: "thr_active",
  busy: false,
  historyLoading: false,
  showArchived: false,
  renamingThreadId: null,
  menuThreadId: null,
  animateHistory: true,
  listeners: new Set(),
  conversations: [
    { threadId: "thr_active", name: "方法讨论", createdAt: 100, updatedAt: 200, archived: false },
    { threadId: "thr_archived", name: "旧总结", createdAt: 50, updatedAt: 80, archived: true },
  ],
});
assert.equal(history.dataset.animate, "true");
assert.ok(find(history, (element) => element.className === "zcs-history-name" && element.textContent === "方法讨论"));
assert.equal(find(history, (element) => element.tagName === "button" && element.textContent === "重命名"), null);
assert.equal(find(history, (element) => element.tagName === "button" && element.textContent === "归档"), null);
const more = find(history, (element) => element.tagName === "button" && element.textContent === "...");
assert.ok(more);
more.listeners.click({ stopPropagation() {} });
const expandedHistory = context.renderConversationHistoryForTest(doc, {
  context: { title: "Codex UI Smoke Test" },
  threadId: "thr_active",
  busy: false,
  historyLoading: false,
  showArchived: false,
  renamingThreadId: null,
  menuThreadId: "thr_active",
  conversations: [
    { threadId: "thr_active", name: "方法讨论", createdAt: 100, updatedAt: 200, archived: false },
  ],
  listeners: new Set(),
});
assert.ok(find(expandedHistory, (element) => element.className === "zcs-history-menu-item" && element.textContent === "重命名"));
assert.ok(find(expandedHistory, (element) => element.className === "zcs-history-menu-item" && element.textContent === "归档"));

panelSession.busy = false;
panelSession.activeThinking = null;
panelSession.activeAssistant = null;
const completedReasoning = {
  role: "reasoning",
  text: "已核对方法、实验结果与局限",
  expanded: false,
};
panelSession.messages = [
  completedReasoning,
  { role: "assistant", text: "论文的主要结论如下。" },
];
for (const listener of panelSession.listeners) listener();
let completedReasoningDetails = find(body, (element) =>
  element.tagName === "details"
  && element.className.includes("zcs-message-reasoning")
);
assert.equal(completedReasoningDetails.open, false);
assert.equal(
  find(completedReasoningDetails, (element) => element.tagName === "summary")?.title,
  "展开思考过程",
);
completedReasoningDetails.open = true;
completedReasoningDetails.listeners.toggle();
assert.equal(completedReasoning.expanded, true);
for (const listener of panelSession.listeners) listener();
completedReasoningDetails = find(body, (element) =>
  element.tagName === "details"
  && element.className.includes("zcs-message-reasoning")
);
assert.equal(completedReasoningDetails.open, true);

panelSession.messages = [];
context.setUILanguageForTest("en-US");
assert.ok(find(body, (element) => element.tagName === "button" && element.textContent === "Summarize this paper"));
assert.ok(find(body, (element) => element.tagName === "button" && element.textContent === "Research related papers"));
assert.ok(find(body, (element) => element.tagName === "option" && element.textContent === "Standard"));
assert.ok(find(body, (element) => element.tagName === "option" && element.textContent === "Fast"));
assert.ok(find(body, (element) => element.className === "zcs-quota-item" && element.textContent === "Week 50%"));
assert.equal(
  find(body, (element) => element.className === "zcs-empty-title")?.textContent,
  "Many a little makes a mickle",
);

context.setUILanguageForTest("zh-CN");
let collectionChildrenRead = 0;
const collection = {
  id: 88,
  key: "UI-COLLECTION",
  libraryID: 1,
  name: "智能体研究",
  getChildItems: () => {
    collectionChildrenRead += 1;
    return [];
  },
  getChildCollections: () => [],
};
const collectionContext = context.createCollectionShellContextForTest([collection]);
assert.equal(collectionChildrenRead, 0);
const collectionBody = new FakeElement("body");
collectionBody.ownerDocument = doc;
await context.renderPanelForTest({ body: collectionBody, doc, context: collectionContext });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(collectionChildrenRead, 0);
assert.ok(find(collectionBody, (element) => element.textContent === "总结这个分类"));
assert.ok(find(collectionBody, (element) => element.textContent === "梳理研究脉络"));
assert.ok(find(collectionBody, (element) => element.textContent === "等待提问后读取分类"));
assert.ok(find(collectionBody, (element) =>
  element.className === "zcs-empty-copy"
  && element.textContent.includes("总结分类文献、梳理研究脉络")
));
assert.equal(
  find(collectionBody, (element) => element.tagName === "textarea")?.placeholder,
  "询问当前分类中的论文…",
);

console.log(JSON.stringify({
  ok: true,
  shellClass: "zcs-root zcs-loading",
  composer: true,
  history: true,
  iconOnlyHeaderActions: true,
  historyManagement: true,
  refreshedUI: true,
  modelControls: true,
  composerModelControls: true,
  iconOnlySidenav: true,
  pdfSelection: true,
  bilingualUI: true,
  conditionalLogin: true,
  weeklyQuotaOnly: true,
  historyOverflowMenu: true,
  readableReasoning: true,
  smoothHistoryReveal: true,
  reasoningSpeed: true,
  completeRoundedControls: true,
  cortexBranding: true,
  compactModelControl: true,
  collapsibleReasoning: true,
  lazyPaperContext: true,
  collectionMode: true,
  lazyCollectionContext: true,
}));
