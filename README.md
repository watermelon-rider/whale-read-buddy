# DeepReader 陪读

陪读型 Chrome 扩展：读取当前页面（HTML / PDF）内容，与 DeepSeek 对话深入学习，
支持划词批注随消息发送、模型主动搜索补充信息。

设计与实现对照文档：[docs/DESIGN.md](docs/DESIGN.md)。

## 开发

```sh
pnpm install
pnpm dev        # 开发模式（HMR，自动打开 Chrome）
pnpm build      # 产物在 .output/chrome-mv3/
pnpm test       # core 纯逻辑单元测试
pnpm compile    # 类型检查
```

## 安装（开发者模式）

1. `pnpm build`
2. Chrome 打开 `chrome://extensions`，开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3/`
4. 点击工具栏图标打开侧边栏，先到「设置」填入你的 DeepSeek API Key

## 功能速览

- 任意网页/PDF 一键陪读：首条消息自动带上当前页面正文，跳转新页面自动补充
- 划词批注：页面或对话消息里选中文字 →「批注」→ 随提问一起发送，模型逐条回应
- 主动搜索：模型判断需要外部信息时自动调用 web_search / web_fetch
- 会话按站点分组持久化，关掉重开接着聊；未发送的批注草稿自动恢复
- 思考模式开关 + 思维链折叠；persona / 全局指令 / 站点指令可配置

## 隐私

API Key 仅存 `chrome.storage.local`；页面内容与对话只发往你自己配置的端点。
