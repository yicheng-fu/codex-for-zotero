"use strict";

var CodexForZoteroPreferences = {
  observer: null,
  mountObserver: null,
  root: null,

  strings: {
    "zh-CN": {
      title: "对话外观",
      description: "调整 Cortex 侧边栏中问题、回答和输入框的显示样式。修改后会立即应用到已打开的对话。",
      language: "界面语言",
      fontSize: "字体大小",
      fontFamily: "字体",
      system: "系统默认",
      sans: "无衬线",
      serif: "衬线",
      mono: "等宽",
      theme: "主题配色",
      emerald: "翡翠绿",
      blue: "海蓝",
      violet: "紫罗兰",
      orange: "暖橙",
      rose: "玫瑰",
    },
    "en-US": {
      title: "Chat appearance",
      description: "Customize the text size, font, and accent color used in Cortex. Changes apply immediately to open chats.",
      language: "Interface language",
      fontSize: "Text size",
      fontFamily: "Font",
      system: "System default",
      sans: "Sans serif",
      serif: "Serif",
      mono: "Monospace",
      theme: "Accent color",
      emerald: "Emerald",
      blue: "Ocean blue",
      violet: "Violet",
      orange: "Warm orange",
      rose: "Rose",
    },
  },

  init(root) {
    if (!root || this.root === root) return;
    this.root = root;
    this.root.addEventListener("unload", () => this.destroy(), { once: true });
    if (!this.observer) {
      this.observer = Zotero.Prefs.registerObserver(
        "extensions.zotero-codex.uiLanguage",
        () => this.render(),
        true,
      );
    }
    this.render();
  },

  destroy() {
    if (this.observer) {
      Zotero.Prefs.unregisterObserver(this.observer);
      this.observer = null;
    }
    if (this.mountObserver) {
      this.mountObserver.disconnect();
      this.mountObserver = null;
    }
    this.root = null;
  },

  observePane() {
    const attach = () => {
      const root = document.getElementById("zotero-codex-preferences");
      if (!root) return false;
      this.init(root);
      if (this.mountObserver) {
        this.mountObserver.disconnect();
        this.mountObserver = null;
      }
      return true;
    };
    if (attach()) return;
    this.mountObserver = new MutationObserver(() => attach());
    this.mountObserver.observe(document.documentElement, { childList: true, subtree: true });
  },

  render() {
    const doc = this.root ? this.root.ownerDocument : document;
    const language = Zotero.Prefs.get("extensions.zotero-codex.uiLanguage", true) === "en-US"
      ? "en-US"
      : "zh-CN";
    const text = this.strings[language];
    const setText = (id, value) => {
      const element = doc.getElementById(id);
      if (element) element.textContent = value;
    };
    const setLabel = (id, value) => {
      const element = doc.getElementById(id);
      if (!element) return;
      element.label = value;
      element.value = element.localName === "label" ? value : element.value;
      element.setAttribute("label", value);
      if (element.localName === "label") element.setAttribute("value", value);
    };

    setText("zcs-preferences-appearance-title", text.title);
    const description = doc.querySelector("#zotero-codex-preferences .zcs-preferences-description");
    if (description) description.textContent = text.description;
    setLabel("zcs-language-label", text.language);
    setLabel("zcs-font-size-label", text.fontSize);
    setLabel("zcs-font-family-label", text.fontFamily);
    setLabel("zcs-font-system", text.system);
    setLabel("zcs-font-sans", text.sans);
    setLabel("zcs-font-serif", text.serif);
    setLabel("zcs-font-mono", text.mono);
    setLabel("zcs-theme-label", text.theme);
    setLabel("zcs-theme-emerald", text.emerald);
    setLabel("zcs-theme-blue", text.blue);
    setLabel("zcs-theme-violet", text.violet);
    setLabel("zcs-theme-orange", text.orange);
    setLabel("zcs-theme-rose", text.rose);
  },
};

CodexForZoteroPreferences.observePane();
