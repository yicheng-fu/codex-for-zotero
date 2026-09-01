import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../bootstrap.js", import.meta.url), "utf8");
const prefs = new Map();
const context = vm.createContext({
  Components: { classes: {}, interfaces: {} },
  Zotero: {
    Prefs: {
      get: (key) => prefs.get(key),
      set: (key, value) => prefs.set(key, value),
    },
    debug: () => {},
    logError: () => {},
  },
  console,
  Intl,
  Date,
  setTimeout,
  clearTimeout,
});

vm.runInContext(`${source}
  globalThis.testAPI = {
    createSession,
    upsertConversation,
    persistSessionConversations,
    mergeStoredThreads,
    messagesFromThread,
    appendThinkingActivity,
    setThinkingSummary,
    finishThinkingActivity,
    serverThreadName,
    displayThreadName,
    newConversation,
    syncSessionModelOptions,
    rateLimitWindows,
    appearanceSettings,
    selectModel,
    selectReasoningEffort,
    selectServiceTier,
    questionWithPDFSelections,
    queuePDFSelection,
    sendQuestion,
    createPaperShellContext,
    hydratePaperContext,
    createCollectionShellContext,
    collectCollectionItems,
    buildCollectionQuestionContext,
    buildCollectionTurn,
    prepareQuestionInput,
    useClient: (client) => { ensureAppServer = async () => client; },
    resetIndexCache: () => { conversationIndexCache = null; },
  };
`, context);

context.Zotero.getTempDirectory = () => ({ path: "/tmp" });

const lazyPaperReads = { title: 0, abstract: 0, attachment: 0 };
const lazyPaperItem = {
  id: 91,
  key: "LAZY-PAPER",
  libraryID: 1,
  isRegularItem: () => true,
  isAttachment: () => false,
  isNote: () => false,
  isAnnotation: () => false,
  getBestAttachment: async () => {
    lazyPaperReads.attachment += 1;
    return null;
  },
  getCreators: () => [{ firstName: "Lazy", lastName: "Reader" }],
  getField: (field) => {
    if (field === "title") {
      lazyPaperReads.title += 1;
      return "Read Only After Asking";
    }
    if (field === "abstractNote") {
      lazyPaperReads.abstract += 1;
      return "An abstract that must not be read during panel rendering.";
    }
    return "";
  },
};
const lazyPaperContext = context.testAPI.createPaperShellContext(lazyPaperItem);
assert.equal(lazyPaperContext.contentLoaded, false);
assert.equal(lazyPaperReads.attachment, 0);
assert.equal(lazyPaperReads.abstract, 0);
const lazyPaperSession = context.testAPI.createSession(lazyPaperContext);
const lazyPaperPrompt = await context.testAPI.prepareQuestionInput(
  lazyPaperSession,
  "这篇论文的研究动机是什么？",
);
assert.equal(lazyPaperReads.attachment, 1);
assert.equal(lazyPaperReads.abstract, 1);
assert.match(lazyPaperPrompt, /An abstract that must not be read/);
assert.match(lazyPaperPrompt, /用户问题：这篇论文的研究动机是什么？/);

let collectionChildrenRead = 0;
let collectionMetadataRead = 0;
const collectionItems = [1, 2].map((number) => ({
  id: 100 + number,
  key: `COLLECTION-${number}`,
  libraryID: 1,
  isRegularItem: () => true,
  isAttachment: () => false,
  isNote: () => false,
  isAnnotation: () => false,
  getBestAttachment: async () => null,
  getCreators: () => [{ firstName: "Collection", lastName: `Author ${number}` }],
  getTags: () => [{ tag: number === 1 ? "agents" : "planning" }],
  getField: (field) => {
    collectionMetadataRead += 1;
    return ({
      title: `Collection Paper ${number}`,
      abstractNote: `Abstract ${number} about intelligent agents and planning.`,
      date: `202${number}`,
      DOI: `10.1000/${number}`,
    })[field] || "";
  },
}));
const lazyCollection = {
  id: 7,
  key: "LAZY-COLLECTION",
  libraryID: 1,
  name: "Agent Research",
  getChildItems: () => {
    collectionChildrenRead += 1;
    return collectionItems;
  },
  getChildCollections: () => [],
};
const lazyCollectionContext = context.testAPI.createCollectionShellContext([lazyCollection]);
assert.equal(lazyCollectionContext.contentLoaded, false);
assert.equal(collectionChildrenRead, 0);
assert.equal(collectionMetadataRead, 0);
const collectionResult = await context.testAPI.buildCollectionQuestionContext(
  lazyCollectionContext,
  "请比较这些论文的研究方法",
);
assert.equal(collectionChildrenRead, 1);
assert.ok(collectionMetadataRead > 0);
assert.equal(collectionResult.total, 2);
assert.equal(collectionResult.records.length, 2);
const collectionPrompt = context.testAPI.buildCollectionTurn(
  lazyCollectionContext,
  "请比较这些论文的研究方法",
  collectionResult,
);
assert.match(collectionPrompt, /Agent Research/);
assert.match(collectionPrompt, /Collection Paper 1/);
assert.match(collectionPrompt, /用户问题：请比较这些论文的研究方法/);
assert.match(
  context.testAPI.serverThreadName(lazyCollectionContext, "方法比较"),
  /^Zotero Collection: Agent Research · 方法比较$/,
);

collectionChildrenRead = 0;
collectionMetadataRead = 0;
const countContext = context.testAPI.createCollectionShellContext([lazyCollection]);
const countResult = await context.testAPI.buildCollectionQuestionContext(
  countContext,
  "这个分类有多少篇论文？",
);
assert.equal(countResult.total, 2);
assert.equal(countResult.records.length, 0);
assert.equal(collectionChildrenRead, 1);
assert.equal(collectionMetadataRead, 0);

const paper = {
  sessionKey: "1:PAPER-KEY",
  title: "A Paper About Agents",
  workdir: "/tmp/paper-key",
};
const session = context.testAPI.createSession(paper);
assert.equal(session.threadId, null);
assert.deepEqual(Array.from(session.conversations), []);

context.testAPI.syncSessionModelOptions(session, [
  {
    id: "gpt-5.3-codex-spark",
    displayName: "GPT-5.3-Codex-Spark",
    isDefault: true,
    defaultReasoningEffort: "low",
    supportedReasoningEfforts: [{ reasoningEffort: "low" }],
  },
  {
    id: "gpt-fast",
    displayName: "GPT Fast",
    defaultReasoningEffort: "low",
    supportedReasoningEfforts: [{ reasoningEffort: "low" }],
    serviceTiers: [{ id: "priority", name: "Fast", description: "1.5x speed" }],
  },
  {
    id: "gpt-deep",
    displayName: "GPT Deep",
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: [
      { reasoningEffort: "medium" },
      { reasoningEffort: "high" },
    ],
    serviceTiers: [{ id: "priority", name: "Fast", description: "1.5x speed" }],
  },
]);
assert.equal(session.selectedModel, "gpt-fast");
assert.equal(session.selectedEffort, "low");
assert.equal(session.models.some((model) => model.id === "gpt-5.3-codex-spark"), false);
context.testAPI.selectModel(session, "gpt-deep");
context.testAPI.selectReasoningEffort(session, "medium");
context.testAPI.selectServiceTier(session, "priority");
assert.equal(session.selectedModel, "gpt-deep");
assert.equal(session.selectedEffort, "medium");
assert.equal(session.selectedServiceTier, "priority");
assert.equal(prefs.get("extensions.zotero-codex.model"), "gpt-deep");
assert.equal(prefs.get("extensions.zotero-codex.reasoningEffort"), "medium");
assert.equal(prefs.get("extensions.zotero-codex.serviceTier"), "priority");

const limits = context.testAPI.rateLimitWindows({
  rateLimits: {
    primary: { usedPercent: 23.4, windowDurationMins: 300, resetsAt: 1000 },
    secondary: { usedPercent: 61.2, windowDurationMins: 10080, resetsAt: 2000 },
  },
});
assert.deepEqual(
  JSON.parse(JSON.stringify(limits.map(({ label, remainingPercent }) => ({
    label,
    remainingPercent,
  })))),
  [
    { label: "周", remainingPercent: 39 },
  ],
);
prefs.set("extensions.zotero-codex.chatFontSize", "16");
prefs.set("extensions.zotero-codex.chatFontFamily", "serif");
prefs.set("extensions.zotero-codex.themeColor", "violet");
const appearance = context.testAPI.appearanceSettings();
assert.equal(appearance.fontSize, 16);
assert.match(appearance.fontFamily, /Songti/);
assert.equal(appearance.theme.accent, "#7555c7");

const selectedQuestion = context.testAPI.questionWithPDFSelections(
  "这句话是什么意思？",
  ["A selected sentence."],
);
assert.match(selectedQuestion, /\[PDF 选中内容 1\]\nA selected sentence\./);
assert.match(selectedQuestion, /用户问题：这句话是什么意思？/);

const requests = [];
const fakeClient = {
  requiresOpenaiAuth: false,
  account: null,
  request: async (method, params) => {
    requests.push({ method, params });
    if (method === "thread/start") {
      return { thread: { id: "thr_selected", createdAt: 400 } };
    }
    return {};
  },
};
context.testAPI.useClient(fakeClient);
const sendSession = context.testAPI.createSession({
  sessionKey: "1:SEND-TEST",
  title: "Selected Text Paper",
  workdir: "/tmp/selected-text-paper",
  excerpt: "Paper body",
});
context.testAPI.syncSessionModelOptions(sendSession, session.models);
context.testAPI.queuePDFSelection(sendSession, "A selected sentence.");
await context.testAPI.sendQuestion(sendSession, "这句话是什么意思？");
const turnStart = requests.find((request) => request.method === "turn/start");
assert.equal(turnStart.params.model, "gpt-deep");
assert.equal(turnStart.params.effort, "medium");
assert.equal(turnStart.params.summary, "detailed");
assert.equal(turnStart.params.serviceTierForTurn, "priority");
assert.match(turnStart.params.input[0].text, /\[PDF 选中内容 1\]/);
assert.equal(turnStart.params.sandboxPolicy.networkAccess, false);
const normalThreadStart = requests.find((request) => request.method === "thread/start");
assert.equal(normalThreadStart.params.config.web_search, "disabled");
assert.equal(normalThreadStart.params.serviceTier, "priority");
assert.match(normalThreadStart.params.developerInstructions, /中文问题只用中文，英文问题只用英文/);
assert.match(normalThreadStart.params.developerInstructions, /论文原文语言、界面语言和引用文本都不能改变回答语言/);
assert.equal(sendSession.pendingSelections.length, 0);

sendSession.busy = false;
sendSession.activeAssistant = null;
await context.testAPI.sendQuestion(sendSession, "调研相关论文", { allowNetwork: true });
const researchTurn = requests.filter((request) => request.method === "turn/start").at(-1);
assert.equal(researchTurn.params.sandboxPolicy.type, "readOnly");
assert.equal(researchTurn.params.sandboxPolicy.networkAccess, true);
const researchResume = requests.filter((request) => request.method === "thread/resume").at(-1);
assert.equal(researchResume.params.config.web_search, "live");
assert.match(researchResume.params.developerInstructions, /可以使用网络搜索/);

collectionChildrenRead = 0;
collectionMetadataRead = 0;
const collectionSendContext = context.testAPI.createCollectionShellContext([lazyCollection]);
const collectionSendSession = context.testAPI.createSession(collectionSendContext);
context.testAPI.syncSessionModelOptions(collectionSendSession, session.models);
await context.testAPI.sendQuestion(collectionSendSession, "请梳理这个分类的研究脉络");
const collectionTurn = requests.filter((request) => request.method === "turn/start").at(-1);
const collectionThreadStart = requests.filter((request) => request.method === "thread/start").at(-1);
assert.equal(collectionChildrenRead, 1);
assert.ok(collectionMetadataRead > 0);
assert.match(collectionTurn.params.input[0].text, /--- 分类文献索引开始 ---/);
assert.match(collectionTurn.params.input[0].text, /Collection Paper 1/);
assert.equal(collectionTurn.params.sandboxPolicy.networkAccess, false);
assert.match(collectionThreadStart.params.developerInstructions, /分类文献分析助手/);
assert.match(collectionThreadStart.params.developerInstructions, /只在问题确实需要正文证据时读取/);

context.testAPI.upsertConversation(session, {
  threadId: "thr_one",
  name: "对话 1",
  createdAt: 100,
  updatedAt: 120,
  archived: false,
});
session.threadId = "thr_one";
context.testAPI.persistSessionConversations(session);

const persisted = JSON.parse(prefs.get("extensions.zotero-codex.conversationIndex"));
assert.equal(persisted.papers[paper.sessionKey].activeThreadId, "thr_one");
assert.equal(persisted.papers[paper.sessionKey].conversations[0].name, "对话 1");
context.testAPI.resetIndexCache();
const restoredSession = context.testAPI.createSession(paper);
assert.equal(restoredSession.threadId, "thr_one");
assert.equal(restoredSession.contextInjected, true);

context.testAPI.mergeStoredThreads(session, [
  {
    id: "thr_two",
    name: "Zotero: A Paper About Agents · 方法讨论",
    createdAt: 200,
    updatedAt: 220,
  },
  {
    id: "thr_unrelated",
    name: "Another app-server conversation",
    createdAt: 300,
    updatedAt: 320,
  },
  {
    id: "thr_legacy",
    name: "Zotero: A Paper About Agents",
    createdAt: 80,
    updatedAt: 90,
  },
], false);
assert.equal(session.conversations.length, 3);
assert.equal(session.conversations[0].name, "方法讨论");
assert.equal(session.conversations.at(-1).name, "早期对话");

const messages = context.testAPI.messagesFromThread({
  turns: [
    {
      items: [
        {
          type: "userMessage",
          content: [{
            type: "text",
            text: "下面是当前在 Zotero 中打开的论文。\n\n--- 论文文本开始 ---\n全文\n--- 论文文本结束 ---\n\n用户问题：核心贡献是什么？",
          }],
        },
        { type: "agentMessage", phase: "commentary", text: "正在阅读" },
        { type: "reasoning", summary: ["识别论文结构", "核对核心贡献"] },
        { type: "agentMessage", phase: "final_answer", text: "核心贡献有三点。" },
      ],
    },
  ],
});
assert.deepEqual(
  JSON.parse(JSON.stringify(messages)),
  [
    { role: "user", text: "核心贡献是什么？" },
    {
      role: "reasoning",
      text: "正在阅读\n\n识别论文结构\n\n核对核心贡献",
      expanded: false,
    },
    { role: "assistant", text: "核心贡献有三点。" },
  ],
);

const thinkingSession = context.testAPI.createSession({
  sessionKey: "1:THINKING-TEST",
  title: "Thinking Test",
  workdir: "/tmp/thinking-test",
});
context.testAPI.appendThinkingActivity(thinkingSession, "正在定位方法章节");
context.testAPI.appendThinkingActivity(thinkingSession, "并核对实验设置");
assert.equal(thinkingSession.activeThinking.text, "正在定位方法章节并核对实验设置");
context.testAPI.setThinkingSummary(thinkingSession, ["已定位方法章节", "已核对实验设置"]);
assert.equal(thinkingSession.activeThinking.text, "已定位方法章节\n\n已核对实验设置");
context.testAPI.finishThinkingActivity(thinkingSession);
assert.equal(thinkingSession.activeThinking, null);
assert.equal(thinkingSession.messages[0].expanded, false);

assert.equal(
  context.testAPI.serverThreadName(paper, "实验讨论"),
  "Zotero: A Paper About Agents · 实验讨论",
);
assert.equal(
  context.testAPI.displayThreadName(paper, "Zotero: A Paper About Agents · 实验讨论"),
  "实验讨论",
);

context.testAPI.newConversation(session);
assert.equal(session.threadId, null);
assert.equal(session.messages.length, 0);
assert.equal(
  JSON.parse(prefs.get("extensions.zotero-codex.conversationIndex"))
    .papers[paper.sessionKey].activeThreadId,
  null,
);

console.log(JSON.stringify({
  ok: true,
  persistence: true,
  discovery: true,
  legacyDiscovery: true,
  historyHydration: true,
  readableReasoning: true,
  reset: true,
  modelSelection: true,
  selectedTextPrompt: true,
  turnOverrides: true,
  reasoningSpeed: true,
  modelExclusion: true,
  rateLimits: true,
  appearancePreferences: true,
}));
