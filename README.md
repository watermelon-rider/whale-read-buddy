# 大肥鱼陪读（WhaleRead Buddy）

> 一只住在你浏览器侧边栏里的鲸鱼娘陪读：读网页、读 PDF，陪你把任何内容聊透。

**English version: [README.en.md](README.en.md)**

![icon](public/icons/icon-128.png)

## 这是什么

一个 Chrome / Arc 扩展（MV3）。打开任意网页或 PDF，点一下工具栏图标，大肥鱼就出现在侧边栏里 —— 她已经读完了你正在看的页面，可以直接开聊。底层是 DeepSeek API（`deepseek-flash` / `deepseek-v4-pro`，1M 上下文，思考模式可选强度）。

## 功能

- **即开即读**：首条消息自动带上当前页面正文（HTML 提取为干净的 Markdown；PDF 抽文本层）；会话中翻页/跳转会自动补充新页面，一个会话可以横跨多页。
- **划词批注**：页面里、对话里都能划词 → 原地批注卡片 → 累积成 chip 列表随提问一起发送，模型用「Annotation N：…」逐条回应；回复里的 Annotation 标签可点开回看原文与批注。
- **主动联网**：模型自己判断要不要查资料，调 DeepSeek 官方 Search/Fetch API（复用同一个 API Key），带来源引用。
- **结构化提问**：大肥鱼缺信息时会弹出选项卡片（A/B/C 点选即答）；关掉没答也不丢 —— 下次打开问题卡片在原位等你补答。
- **富内容渲染**：KaTeX 公式、Mermaid 流程图/时序图、提示卡（NOTE/TIP/WARNING）、步骤条、时间线、可排序表格；图和公式可以一键投到完整浏览器窗口放大观察、缩放平移。
- **人设可玩**：默认是只傲娇鲸鱼娘；设置里可改人设、全局系统提示词、当前会话提示词（三层提示词体系，改动下一条消息即生效）。
- **会话持久化**：按站点分组的历史列表、重命名、删除二次确认、未发送的批注草稿自动恢复、滚动位置记忆。
- **中英双语**：界面和提示词都跟随浏览器语言；中文环境叫「大肥鱼陪读」，英文环境叫 WhaleRead Buddy。

## 隐私

- API Key 只存在你浏览器的 `chrome.storage.local`，**永不同步、永不外传**；
- 页面内容和对话只发向你自己配置的 DeepSeek 端点（默认官方 API）；
- 页面正文提取完全在本地完成，不经过任何第三方服务。

## 安装

**方式一：下载打包好的 zip（推荐）**

到 [Releases](https://github.com/watermelon-rider/whale-read-buddy/releases) 下载最新 `whale-read-buddy-*-chrome.zip`，解压后在 `chrome://extensions` 开启「开发者模式」→「加载已解压的扩展程序」→ 选解压出来的目录。

**方式二：自己构建**

```sh
pnpm install
pnpm build        # 产物在 .output/chrome-mv3/
```

然后同样在 `chrome://extensions` 加载 `.output/chrome-mv3/`。

装好后点工具栏图标打开侧边栏，先到 ⚙ 设置里填入你的 DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com) 创建）。

## 开发

```sh
pnpm dev        # 开发模式（HMR）
pnpm build      # 生产构建
pnpm test       # core 纯逻辑单元测试（vitest）
pnpm compile    # 类型检查
```

技术栈：WXT + React + TypeScript + Dexie（IndexedDB）。架构与设计决策见 [docs/DESIGN.md](docs/DESIGN.md)。

## 浏览器兼容

- Chrome / Edge：完整支持（Side Panel 形态）。
- Arc：不支持 `chrome.sidePanel` 的版本自动降级为弹出窗口，功能一致。
- Firefox：未适配（MV3 sidePanel 差异），欢迎 PR。
