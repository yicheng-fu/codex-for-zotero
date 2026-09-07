# Cortex: A Codex-Powered Sidebar Agent for Zotero

Cortex 是一个将 Codex 对话集成到 Zotero 右侧栏的开源插件。它可以围绕当前论文进行问答，也可以分析当前分类中的多篇文献，帮助总结主题、比较方法并梳理研究脉络。


## 主要功能

- 在 Zotero 右侧栏直接与 Codex 对话
- 正常显示回复中的 Markdown 与 LaTeX 数学公式
- 按需读取当前论文，不会在打开论文时自动加载全文
- 按需分析当前分类中的论文，支持总结、比较和脉络梳理
- 在 PDF 中划词或划句，通过“＋ Codex”加入对话
- 管理、重命名、归档和恢复历史对话
- 切换模型、推理强度与推理速度
- 中英文界面、字体、字号和主题配色设置
- 展示每周剩余额度，并将已完成的思考过程自动收起

## 安装

1. 下载最新版 [cortex-for-zotero.xpi](https://raw.githubusercontent.com/yicheng-fu/codex-for-zotero/main/dist/cortex-for-zotero.xpi)。
2. 在 Zotero 中打开“工具 → 插件”。
3. 点击右上角齿轮按钮，选择“从文件安装插件”，并选择下载的 XPI 文件。
4. 重启 Zotero。

## 运行要求

- Zotero 7–10
- 已安装 Codex CLI，或安装了内置 Codex 的 ChatGPT 桌面端
- 已登录 Codex；首次使用前可在终端运行一次 `codex login`
- 如需论文全文问答，Zotero 应已为 PDF 建立全文索引

## 使用

打开论文后，在右侧栏点击 Cortex 图标即可提问。选择一个分类并保持条目列表无选中项时，可以让 Cortex 分析该分类及其子分类中的文献。

Cortex 使用惰性上下文策略：只有发送问题后才会读取与问题相关的论文信息。当前论文或分类用于向 Codex 提供上下文，不限制 Codex 回答其他问题或使用自身能力。本地文件访问始终保持只读；网页搜索默认可用，Codex 会在问题需要最新信息、外部证据或来源链接时主动使用。

界面语言、字体、字号和主题可在“Zotero → 设置 → Cortex”中调整。

## 许可证

本项目基于 [MIT License](LICENSE) 开源；数学公式渲染使用随插件分发的 [KaTeX](vendor/katex/LICENSE)。
