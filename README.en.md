# Cortex: A Codex-Powered Sidebar Agent for Zotero

[简体中文](README.md) | **English**

Cortex is an open-source plugin that brings Codex conversations into Zotero’s right sidebar. Ask questions about the current paper or explore multiple papers in a collection to summarize themes, compare methods, and trace how a research field has developed.

## Features

- Chat with Codex directly in Zotero’s sidebar
- Read responses with Markdown formatting and LaTeX equations
- Load paper context on demand, without automatically reading the full text when you open a paper
- Analyze papers in a collection to summarize findings, compare approaches, and trace research developments
- Select text in a PDF and click **+ Ask Cortex** to add it to the conversation
- Manage, rename, archive, and restore past conversations
- Switch models and reasoning effort; toggle Fast mode with the lightning button
- Customize the interface language (Chinese or English), font, font size, and theme color
- Check your remaining weekly quota as a percentage and expand reasoning details when needed

## Installation

1. Download the latest [cortex-for-zotero.xpi](https://raw.githubusercontent.com/yicheng-fu/codex-for-zotero/main/dist/cortex-for-zotero.xpi).
2. In Zotero, open **Tools → Plugins**.
3. Click the gear button in the upper-right corner, choose **Install Plugin From File**, and select the downloaded XPI file.
4. Restart Zotero.

## Requirements

- Zotero 7–10
- Codex CLI installed, or a ChatGPT desktop installation that includes Codex
- An active Codex login; if needed, run `codex login` in your terminal before using the plugin for the first time
- Zotero’s full-text index for the PDF if you want to ask questions about its full text

## Usage

Open a paper and click the Cortex icon in the right sidebar to start asking questions. To analyze a collection and its subcollections, select the collection and leave all items in the item list unselected.

Cortex loads context on demand: it reads relevant paper information only after you send a question. The current paper or collection provides context for Codex without limiting it to questions about that material. Local file access remains read-only. Web search is available by default, and Codex can use it when a question requires up-to-date information, external evidence, or source links.

Use the controls below the message input to choose a model and reasoning effort. The lightning icon lights up when Fast mode is enabled and remains dim in Standard mode. Fast mode uses more credits and is available only for supported models. Hover over the quota percentage to see additional details.

Adjust the interface language, font, font size, and theme under **Zotero → Settings → Cortex**.

## License

Cortex is released under the [MIT License](LICENSE). Mathematical notation is rendered with the bundled [KaTeX](vendor/katex/LICENSE) library.
