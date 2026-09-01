import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class FakeElement {
  constructor(className = "") {
    this.className = className;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.ownerDocument = null;
    this.isConnected = true;
  }

  append(...children) {
    for (const child of children) {
      child.ownerDocument ||= this.ownerDocument;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  querySelector(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    for (const child of this.children) {
      if (className && String(child.className).split(/\s+/).includes(className)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }
}

const source = await readFile(new URL("../bootstrap.js", import.meta.url), "utf8");
const prefs = new Map();
let childItemReads = 0;
const collection = {
  id: 12,
  key: "COLLECTION-INTEGRATION",
  libraryID: 1,
  name: "Collection Integration",
  getChildItems: () => {
    childItemReads += 1;
    return [];
  },
  getChildCollections: () => [],
};
const messageBox = new FakeElement();
const doc = {
  querySelector: (selector) => selector.includes("zotero-item-pane-message-box")
    ? messageBox
    : messageBox.querySelector(selector),
  createElementNS: () => {
    const element = new FakeElement();
    element.ownerDocument = doc;
    return element;
  },
};
messageBox.ownerDocument = doc;
let selectedItems = [];
let originalCollectionCalls = 0;
let originalItemCalls = 0;
const originalCollectionSelected = async () => {
  originalCollectionCalls += 1;
};
const originalItemSelected = async () => {
  originalItemCalls += 1;
};
const pane = {
  itemsView: { getSelectedObjects: () => selectedItems },
  getSelectedCollection: () => collection,
  onCollectionSelected: originalCollectionSelected,
  itemSelected: originalItemSelected,
};
const win = { document: doc, ZoteroPane: pane };
let renderedContext = null;

const sandbox = vm.createContext({
  Components: { classes: {}, interfaces: {} },
  Zotero: {
    Prefs: {
      get: (key) => prefs.get(key),
      set: (key, value) => prefs.set(key, value),
    },
    getTempDirectory: () => ({ path: "/tmp" }),
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
  renderPanel = async ({ context }) => { globalThis.renderedContext = context; };
  globalThis.integrationAPI = {
    installCollectionPanelIntegration,
    restoreCollectionPanelIntegration,
  };
`, sandbox);

sandbox.integrationAPI.installCollectionPanelIntegration(win);
assert.notEqual(pane.onCollectionSelected, originalCollectionSelected);
assert.notEqual(pane.itemSelected, originalItemSelected);
await pane.onCollectionSelected();
await new Promise((resolve) => setTimeout(resolve, 120));
renderedContext = sandbox.renderedContext;
assert.equal(originalCollectionCalls, 1);
assert.equal(renderedContext.kind, "collection");
assert.equal(renderedContext.title, "Collection Integration");
assert.equal(renderedContext.contentLoaded, false);
assert.equal(childItemReads, 0);
assert.ok(messageBox.querySelector(".zcs-collection-panel-host"));

selectedItems = [{ id: 99 }];
await pane.itemSelected();
await new Promise((resolve) => setTimeout(resolve, 120));
assert.equal(originalItemCalls, 1);
assert.equal(childItemReads, 0);

sandbox.integrationAPI.restoreCollectionPanelIntegration();
assert.equal(pane.onCollectionSelected, originalCollectionSelected);
assert.equal(pane.itemSelected, originalItemSelected);

console.log(JSON.stringify({
  ok: true,
  collectionSelectionHook: true,
  lazyCollectionMount: true,
  lifecycleRestore: true,
}));
