import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const xhtml = await readFile(new URL("../preferences.xhtml", import.meta.url), "utf8");
const script = await readFile(new URL("../preferences.js", import.meta.url), "utf8");
const defaults = await readFile(new URL("../prefs.js", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../bootstrap.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

assert.match(xhtml, /preference="extensions\.zotero-codex\.uiLanguage"/);
assert.match(xhtml, /value="zh-CN"/);
assert.match(xhtml, /value="en-US"/);
assert.match(script, /Chat appearance/);
assert.match(script, /对话外观/);
assert.match(defaults, /uiLanguage", "zh-CN"/);
assert.match(defaults, /serviceTier", "default"/);
assert.match(bootstrap, /scripts: \[`\$\{pluginRootURI\}preferences\.js`\]/);
assert.equal(manifest.name, "Cortex");
assert.equal(manifest.version, "0.5.10");
assert.equal(manifest.author, "Yicheng Fu");
assert.equal(manifest.applications.zotero.id, "cortex@yicheng-fu.github.io");
assert.equal(
  manifest.applications.zotero.update_url,
  "https://raw.githubusercontent.com/yicheng-fu/codex-for-zotero/main/update.json",
);
assert.match(xhtml, /Cortex 侧边栏/);

function element(localName = "label") {
  return {
    localName,
    textContent: "",
    value: "",
    label: "",
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener() {},
  };
}

const elements = new Map([
  ["zcs-preferences-appearance-title", element("h2")],
  ["zcs-language-label", element()],
  ["zcs-font-size-label", element()],
  ["zcs-font-family-label", element()],
  ["zcs-font-system", element("menuitem")],
  ["zcs-font-sans", element("menuitem")],
  ["zcs-font-serif", element("menuitem")],
  ["zcs-font-mono", element("menuitem")],
  ["zcs-theme-label", element()],
  ["zcs-theme-emerald", element("menuitem")],
  ["zcs-theme-blue", element("menuitem")],
  ["zcs-theme-violet", element("menuitem")],
  ["zcs-theme-orange", element("menuitem")],
  ["zcs-theme-rose", element("menuitem")],
]);
const description = element("description");
const root = element("vbox");
const doc = {
  documentElement: root,
  getElementById: (id) => id === "zotero-codex-preferences" ? root : elements.get(id) || null,
  querySelector: () => description,
};
root.ownerDocument = doc;
const preferenceContext = vm.createContext({
  document: doc,
  Zotero: {
    Prefs: {
      get: () => "en-US",
      registerObserver: () => Symbol("language"),
      unregisterObserver: () => {},
    },
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
});
vm.runInContext(script, preferenceContext);
assert.equal(elements.get("zcs-preferences-appearance-title").textContent, "Chat appearance");
assert.equal(elements.get("zcs-language-label").value, "Interface language");
assert.equal(elements.get("zcs-theme-violet").label, "Violet");
assert.match(description.textContent, /Changes apply immediately/);

console.log(JSON.stringify({
  ok: true,
  bilingualPreferences: true,
  languagePreference: true,
  preferenceScriptRegistered: true,
  preferenceRuntimeTranslation: true,
}));
