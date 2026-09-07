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
  globalThis.renderMarkdownForTest = renderMarkdown;
  globalThis.setKatexRendererForTest = (renderer) => {
    katexTestRenderer = renderer;
  };
  globalThis.getPanelSessionForTest = () => [...sessions.values()][0];
  globalThis.setUILanguageForTest = (language) => {
    setPref(UI_LANGUAGE_PREF, language);
    for (const session of sessions.values()) notifySession(session);
  };
`, context);

context.renderPanelShellForTest({ body, doc });
context.setKatexRendererForTest({
  render: (sourceText, element, options) => {
    element.classList.add("katex-rendered");
    element.dataset.mathSource = sourceText;
    element.dataset.displayMode = String(options.displayMode);
  },
});

assert.equal(body.children.length, 1);
assert.equal(body.children[0].className, "zcs-root zcs-loading");
assert.equal(body.children[0].textContent, "正在载入当前论文…");
assert.match(documentElement.children[0].textContent, /\.zcs-loading \{ min-height: 156px/);

const markdown = context.renderMarkdownForTest(doc, [
  "## 结论",
  "",
  "这是 **重点**、*强调* 和 `inline()`。",
  "行内公式 $E = mc^2$ 与 \\(a+b\\)。",
  "",
  "- 第一项",
  "- [x] 已完成",
  "",
  "> 引用内容",
  "",
  "| 方法 | 结果 |",
  "| :--- | ---: |",
  "| Cortex | 正常 |",
  "",
  "```js",
  "const safe = '<script>';",
  "```",
  "",
  "$$",
  "\\int_0^1 x^2 \\, dx",
  "$$",
  "",
  "\\[\\sum_{i=1}^{n} i\\]",
  "",
  "[官方来源](https://example.com) [危险链接](javascript:alert(1)) <script>alert(1)</script>",
].join("\n"));
assert.ok(find(markdown, (element) => element.tagName === "h2"));
assert.ok(find(markdown, (element) => element.tagName === "strong"));
assert.ok(find(markdown, (element) => element.tagName === "em"));
assert.ok(find(markdown, (element) => element.className === "zcs-markdown-inline-code"));
assert.ok(find(markdown, (element) => element.tagName === "ul"));
assert.ok(find(markdown, (element) => element.tagName === "blockquote"));
assert.ok(find(markdown, (element) => element.tagName === "table"));
assert.ok(find(markdown, (element) => element.className === "language-js"));
assert.ok(find(markdown, (element) =>
  element.className.includes("zcs-markdown-math")
  && element.dataset.mathSource === "E = mc^2"
  && element.dataset.displayMode === "false"
));
assert.ok(find(markdown, (element) =>
  element.className.includes("zcs-markdown-math-display")
  && element.dataset.mathSource.includes("\\int_0^1")
  && element.dataset.displayMode === "true"
));
assert.ok(find(markdown, (element) =>
  element.className.includes("zcs-markdown-math-display")
  && element.dataset.mathSource.includes("\\sum_{i=1}^{n}")
));
assert.ok(find(markdown, (element) => element.tagName === "a" && element.href === "https://example.com"));
assert.equal(find(markdown, (element) => element.tagName === "script"), null);
assert.equal(find(markdown, (element) => String(element.href || "").startsWith("javascript:")), null);

const escapedFormulaOutput = context.renderMarkdownForTest(doc, String.raw`常见端到端驾驶模型通过模仿学习：
\\[\hat{\tau}=\pi\_\theta(I,s\_{\mathrm{ego}},c),
\qquad
\mathcal L=\operatorname{dist}(\hat{\tau},\tau\_{\mathrm{human}})\\]

其中，\\(I\\) 是图像，\\(c\\) 是导航指令。`);
assert.ok(find(escapedFormulaOutput, (element) =>
  element.className.includes("zcs-markdown-math-display")
  && element.dataset.mathSource.includes("\\hat{\\tau}=\\pi_\\theta")
  && element.dataset.mathSource.includes("s_{\\mathrm{ego}}")
));
assert.ok(find(escapedFormulaOutput, (element) =>
  element.className.includes("zcs-markdown-math")
  && element.dataset.mathSource === "I"
  && element.dataset.displayMode === "false"
));

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
assert.equal(find(body, (element) => element.className === "zcs-empty-title"), null);
const login = find(body, (element) => element.className === "zcs-link-button");
assert.equal(login.hidden, true);
const renderedRoot = find(body, (element) => element.className === "zcs-root");
assert.equal(renderedRoot.style["--zcs-chat-font-size"], "12px");
assert.match(documentElement.children[0].textContent, /\.zcs-message \{[^}]*border: 0;/);
assert.match(documentElement.children[0].textContent, /\.zcs-message-assistant, \.zcs-message-reasoning \{[^}]*align-self: flex-start;[^}]*box-sizing: border-box;[^}]*width: 91%;[^}]*max-width: 91%;/);
assert.match(documentElement.children[0].textContent, /\.zcs-markdown-code-block \{[^}]*overflow-x: auto;/);
assert.match(documentElement.children[0].textContent, /\.zcs-markdown-table-wrap \{[^}]*overflow-x: auto;/);
assert.match(documentElement.children[0].textContent, /\.zcs-markdown-math-display \{[^}]*overflow-x: auto;/);
assert.ok(documentElement.children.find((element) =>
  element.id === "zotero-codex-katex-styles"
  && element.href.endsWith("vendor/katex/katex.min.css")
));
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
assert.equal(source.includes("积小成巨"), false);
assert.equal(source.includes("Many a little makes a mickle"), false);
assert.equal(source.includes('session.busy ? "■" : "↑"'), false);

const panelSession = context.getPanelSessionForTest();
panelSession.messages = [{ role: "assistant", text: "## Markdown\n\n支持 **粗体** 和 `代码`。" }];
for (const listener of panelSession.listeners) listener();
const markdownBubble = find(body, (element) =>
  element.className.includes("zcs-message-assistant")
);
assert.ok(find(markdownBubble, (element) => element.tagName === "h2"));
assert.ok(find(markdownBubble, (element) => element.tagName === "strong"));
assert.ok(find(markdownBubble, (element) => element.className === "zcs-markdown-inline-code"));

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
assert.equal(find(body, (element) => element.className === "zcs-empty-title"), null);

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
