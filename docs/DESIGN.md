# DeepReader 设计文档

> 陪读型 Chrome 扩展：读取当前页面（HTML / PDF），基于 DeepSeek API 与用户就页面内容对话，
> 支持划词批注、主动搜索补充信息。
>
> 设计参考：deepseek-harness（会话组织 / 工具循环 / 压缩）、dsh-annotation（批注交互与协议）。
> 本文档是实现的唯一对照标准，实现与本文档冲突时先讨论再改。

## 1. 产品形态

- Chrome MV3 扩展，主界面为 **Side Panel**（点击工具栏图标打开），中文 UI。
- 聊天区域视觉参考 dsh web 的 chat 区，宽度收窄适配侧边栏。
- 支持内容：HTML 网页正文、PDF 文本层。图片理解（deepseek-flash 原生支持视觉）预留接口，MVP 不实现。

### 核心场景

1. 用户打开任意网页/PDF → 点图标打开 Side Panel → 开始提问。
2. 首次发消息时自动提取当前页面内容随消息发送；会话中跳转 URL（翻页/关联阅读）时再次注入新页面内容。
3. 用户在页面或对话消息中划词批注，批注积累在输入框旁的 chip 列表，Enter 随消息一起发送。
4. 模型判断需要外部信息时，通过 function calling 调用 `web_search` / `web_fetch`（DeepSeek Search & Fetch API）。
5. 模型可通过 `ask_user` 工具向用户发起结构化提问。

## 2. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 扩展框架 | WXT | MV3 清单自动生成、content script / side panel 隔离构建、HMR |
| UI | React + TS | 聊天界面流式渲染、Markdown 渲染生态成熟 |
| 存储 | IndexedDB（Dexie 封装） | MV3 各 context 共享；配额宽裕；Dexie 只是封装不是新数据库 |
| 正文提取 | Defuddle | Readability+Turndown 二合一，输出 Markdown，Obsidian Web Clipper 同款 |
| PDF 解析 | pdf.js | 仅取文本层，不渲染 |
| Markdown 渲染 | react-markdown + remark-gfm + shiki（懒加载） | 聊天消息渲染 |

## 3. 总体架构

三个运行 context，职责严格分离：

```
┌─────────────────────────────────────────────────────────┐
│ Content Script（页面内）                                 │
│  - Defuddle 提取正文 → Markdown                          │
│  - 页面划词捕获 → 发给 Side Panel                        │
│  - 未发送批注的页面高亮恢复（精确匹配）                   │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.runtime Port（长连接）
┌──────────────▼──────────────────────────────────────────┐
│ Side Panel（React UI）                                   │
│  - 聊天视图 / 历史列表视图 / 设置视图                     │
│  - 对话内划词批注捕获                                    │
│  - 批注 chip 列表、草稿管理                              │
│  - SSE 流式渲染、思维链折叠                              │
└──────────────┬──────────────────────────────────────────┘
               │ chrome.runtime.sendMessage
┌──────────────▼──────────────────────────────────────────┐
│ Background Service Worker                                │
│  - Agent 循环（turn/step 状态机）                        │
│  - 会话日志（事件溯源）+ deriveMessages() 投影           │
│  - LLM 调用（SSE）、工具执行（web_search/web_fetch/…）   │
│  - PDF fetch + pdf.js 文本提取                           │
│  - compaction（token 压力摘要）                          │
│  - IndexedDB 持久化（唯一写入口）                        │
└──────────────────────────────────────────────────────────┘
```

**关键决策：Agent 循环和会话日志放在 background，而不是 side panel。**
原因：side panel 可被用户随时关闭，而流式响应、工具调用、compaction 都不该因此中断；
side panel 重开后通过日志投影重建 UI 状态。

### 模块划分（src/ 目录结构）

```
src/
├── entrypoints/
│   ├── background.ts          # service worker 入口：装配各服务
│   ├── content.ts             # content script 入口：提取 + 划词捕获
│   └── sidepanel/             # React 应用入口
│       ├── index.html
│       └── main.tsx
├── core/                      # 纯逻辑，不依赖 chrome.* API，可单测
│   ├── session/
│   │   ├── events.ts          # 会话事件类型定义（SessionEventMap）
│   │   ├── session.ts         # 事件溯源 Session：append / deriveMessages
│   │   └── compaction.ts      # token 测量、阈值判断、摘要压缩
│   ├── agent/
│   │   ├── loop.ts            # turn/step 状态机驱动器
│   │   ├── inbox.ts           # 输入领取
│   │   └── tools.ts           # 工具调度（串行执行，留并行口子）
│   ├── llm/
│   │   ├── deepseek.ts        # DeepSeek API 客户端（chat/completions, SSE）
│   │   └── stream.ts          # SSE 解析、reasoning_content 分离
│   ├── extract/
│   │   ├── html.ts            # Defuddle 管线的纯函数部分
│   │   └── pdf.ts             # pdf.js 文本层提取
│   ├── web/
│   │   ├── search.ts          # DeepSeek Search API（/v1/tools/search）
│   │   └── fetch.ts           # DeepSeek Fetch API（/v1/tools/fetch）
│   ├── annotation/
│   │   ├── protocol.ts        # 批注协议块组装/解析（「其他信息：」分隔符）
│   │   └── draft.ts           # 草稿批注数据结构与归一化
│   └── prompt/
│       ├── system.ts          # 系统提示词组装（persona / 指令 / time-context）
│       └── instructions.ts    # 全局指令 + per-origin 指令，字节预算
├── services/                  # chrome.* 胶水层
│   ├── storage/
│   │   ├── db.ts              # Dexie 表结构
│   │   ├── sessions.ts        # 会话持久化（日志 append / 快照恢复）
│   │   ├── drafts.ts          # 草稿（批注 + 输入框）
│   │   └── settings.ts        # 设置（API key / baseURL / model / persona…）
│   ├── bridge.ts              # background ↔ sidepanel / content 消息路由
│   └── extract-service.ts     # 触发 content script 提取、PDF 提取编排
├── ui/                        # side panel React 组件
│   ├── chat/
│   │   ├── ChatView.tsx       # 聊天主视图
│   │   ├── MessageList.tsx    # 消息列表（流式增量渲染）
│   │   ├── MessageBubble.tsx  # 单条消息（Markdown / 思维链折叠 / Annotation N chip）
│   │   ├── Composer.tsx       # 输入框 + 批注 chip 列表 + 思考模式开关
│   │   └── SelectionAnnotator.tsx  # 对话内划词批注
│   ├── history/
│   │   └── HistoryView.tsx    # 按 origin 分组的会话列表
│   ├── settings/
│   │   └── SettingsView.tsx   # API key / baseURL / 模型 / persona / 指令
│   └── shared/
├── content/                   # content script 内逻辑
│   ├── annotate.ts            # 页面划词工具条（「批注」按钮）
│   └── highlight.ts           # 草稿高亮恢复
└── types/
    └── messages.ts            # 跨 context 消息协议类型
```

## 4. 会话模型（借鉴 harness dsh-session / dsh-agent-loop）

### 4.1 事件溯源日志

每个会话是一条 append-only 的类型化事件日志。**模型可见即已记录**：发给模型的任何内容
必须能从日志重建。模型历史由 `deriveMessages()` 从日志投影，不维护裸 messages 数组。

事件类型（MVP 子集，参照 harness 命名）：

| 事件 | 内容 | 是否进模型历史 |
|---|---|---|
| `request/header` | 模型、思考模式、工具集快照（变更时记录） | 否（元数据） |
| `system/message` | 渲染后的系统提示词；最新非空节点生效 | 是 |
| `context/page` | 页面注入：origin、normalizedUrl、标题、Markdown 正文哈希 + 全文 | 是（user 角色） |
| `context/time` | 时钟读数：当前时间、时区、距上条消息经过时长 | 是（user 角色） |
| `user/message` | 用户消息（含批注协议块） | 是 |
| `assistant/message` | 助手消息（含 reasoning_content，UI 折叠显示） | 是 |
| `assistant/attempt` | 失败/取消的尝试，保留已交付前缀，`interrupted: true` | 见 4.3 |
| `tool/call` + `tool/result` | 工具调用与结果（web_search / web_fetch / ask_user） | 是（tool 角色） |
| `compaction/summary` | 压缩摘要节点，遮蔽被压缩区间 | 是（替换被压缩区间） |

规则：
- 被取消的流把已交付文本提交为 `assistant/message { interrupted: true }`，下次请求包含用户已看到的内容。
- `context/page` 去重：同会话内 normalizedUrl + 正文哈希均未变时不重复注入。
- compaction 只做"遮蔽"不做删除，日志保留全部历史供回放/导出。

### 4.2 会话归属与恢复

- 会话归属 **origin**（协议+域名+端口）；一个会话可跨多个 URL（多个 `context/page` 节点）。
- 历史列表按 origin 分组展示；不同 origin 的会话互不串。
- 持久化到 IndexedDB，重开浏览器/标签页后恢复。
- URL 归一化：去 `#hash`、去 utm_* 等跟踪参数。PDF 以文件 URL 为 key。

### 4.3 Agent 循环（turn/step 状态机）

```
turn 开始
  └─ step：
       1. 领取输入（用户消息）
       2. 组装：系统提示词（persona+指令+time-context）→ deriveMessages() → 工具 schema
       3. 发起 SSE 流式请求；UI 实时增量
       4. 若返回 tool_calls：执行工具 → tool/result 追加日志 → 进入下一 step
       5. 无 tool_calls：提交 assistant/message，turn 结束
```

- 工具串行执行（MVP），类型上保留并行口子。
- 取消是协作式的：中断当前流，已交付文本落盘。

### 4.4 Compaction（借鉴 dsh-compaction-basic）

- token 测量：DeepSeek 无官方 tokenizer，用 `chars / 2.5` 的保守估计 + API 返回的 usage 校准。
- 阈值：`thresholdRatio 0.8`（deepseek-flash 1M 上下文 → 约 80 万 token 触发）。
- 策略：保留最近 N 轮（retainRatio 0.16），更早历史用同模型摘要为 `compaction/summary` 节点。
- 上下文溢出错误兜底：先压缩再重试该请求。

## 5. 内容提取管道

### 5.1 HTML

- content script 内执行 Defuddle → 正文 Markdown + 元数据（标题、作者、发布时间）。
- 完全本地，页面内容不外发第三方。
- 超长截断策略：保留开头 + 结尾，掐中间（预留 budget 常量，默认 40K tokens 估值）。

### 5.2 PDF（方案 C）

- content script 无法注入 Chrome 内置 PDF 查看器。
- background 检测当前 tab URL 指向 PDF → `fetch` 原始字节 → pdf.js 提取文本层 → 走与 HTML 相同的 `context/page` 注入。
- PDF 下不支持页面划词批注（MVP 明确排除）。
- 自建 PDF 查看器（方案 B）留作后续升级方向，架构上 extract 管道已隔离。

## 6. 批注系统（借鉴 dsh-annotation）

### 6.1 交互闭环

```
页面/对话内划词 →「批注」按钮 → 原地编辑卡片（引用 + 输入框 + ✓）→ 回车/打勾确认
    → 输入框旁「批注 ×N」chip（hover 查看 / 逐条删除）
    → Enter：批注协议块 + 提问正文一起发送
    → 模型按「Annotation 1：…」「Annotation 2：…」逐条回应
    → 回复中的 Annotation N 渲染为 hoverable chip（显示原文+批注）
```

- 两条采集管道：页面划词（content script）、对话消息划词（side panel 内），汇入同一 chip 列表。
- 原地编辑卡片为 Codex 风格；页面侧点击已有高亮/编号标记可进入编辑模式（改批注或删除）。
- 批注草稿的唯一写入口是 background：content script 上报 → 写 IndexedDB → 广播面板 → 回同步页面重画高亮（canonical index 一致）。
- IME 安全：Enter 拦截带 `isComposing` / keyCode 229 守卫。
- 发送后批注块在用户气泡中只显示 chip，不显示协议文本（协议块仅模型可见）。

### 6.2 协议块格式（模型可见的消息结构）

```text
[用户的提问正文]

其他信息：
我批注了以下 N 处内容：
1. 「原文节选」
   批注：用户写的批注
2. 「……」
   批注：……

请用「Annotation 1：…」「Annotation 2：…」的格式逐条回应我的批注。
```

分隔符为 `其他信息：`（无方括号）。解析与气泡隐藏均以此分隔符为准，注意避开常见词碰撞。

### 6.3 持久化策略

- **已发送批注**：物化为 `user/message` 的一部分，随会话日志持久化。**不做页面锚定。**
- **未发送草稿**（批注列表 + 输入框草稿）：按会话持久化到 IndexedDB，重开恢复。
  - 页面高亮恢复：按原文精确匹配重新画高亮；匹配不上（页面已变）仅保留 chip 内容，不报错。
- 对话内批注的"锚定"：记录消息 id + 选中文本，恢复时消息在历史里必然存在，可精确恢复高亮。

## 7. 工具系统（借鉴 dsh-tool-web）

function calling 注册三个工具：

### 7.1 web_search

- 后端：DeepSeek Search API `POST {baseURL}/v1/tools/search`，`Authorization: Bearer <apiKey>`。
- 参数：`queries: string[]`（1–4 个，去重、并发、轮询合并、URL 去重、上限 8 条来源）。
- 返回：`Sources:` 列表（标题/URL/snippet/日期）+ 固定引用指引。
- 工具注册不依赖后端可用性：key 缺失/端点故障时返回模型可读的结构化错误
  （`WEB_PROVIDER_CREDENTIAL_MISSING` / `WEB_PROVIDER_ERROR`），模型引导用户去设置。

### 7.2 web_fetch

- 后端：DeepSeek Fetch API `POST {baseURL}/v1/tools/fetch`，返回页面 Markdown。
- 输出上限 200K 字符，截断追加页脚提示；内容标记为"外部不可信数据"。

### 7.3 ask_user（借鉴 dsh-tool-ask-user）

- 模型向用户发起结构化提问（1–3 个问题，每个带 2–3 个选项，推荐项置首）。
- UI：side panel 内嵌问题卡片，用户选择/填写后作为 `tool/result` 返回。
- 阻塞模式（MVP）：等待用户回答；`timeout: -1` 无限等待。

## 8. 提示词组装（借鉴 persona / time-context / agent-instructions）

系统提示词按段落组装，渲染时解析变量：

1. **persona 段**：用户在设置中配置的陪读人设（默认：博学耐心的阅读伙伴）。
2. **系统提示词段**：用户自定义的全局提示词（设置页配置，对所有会话生效）。
3. **会话提示词段**：仅对当前会话生效的提示词（设置页配置，按 conversationId 存储）。
4. **工具指引段**：web_search / web_fetch / ask_user 的使用规约。
5. **time-context**：不作为系统段落，按 harness 做法在每个 step 注入独立 context 节点
   （当前时间、时区、距上条消息经过时长；默认最小间隔 10 分钟）。

指令总预算：默认 8K 字节，超出时先省略宽泛（全局）指令，站点指令最后截断。

## 9. 模型与安全

- 默认模型 `deepseek-flash`（V4.1-Flash，1M 上下文，支持思考/非思考切换、图像理解）；
  可选 `deepseek-v4-pro`。
- 思考模式：UI 开关（会话级）；`reasoning_content` 流式分离，UI 折叠显示。
- API key 用户自配，存 `chrome.storage.local`（不上 sync）；支持自定义 baseURL（代理/网关）。
- 页面内容、搜索内容只发往用户自己配置的端点；隐私政策在商店描述中写明。
- `host_permissions: <all_urls>`（陪读工具需任意页面开箱即用；PDF fetch 同样需要）。

## 10. MVP 功能清单（一次性全做）

- [x] WXT + React + TS 脚手架，Side Panel / content script / background 三端打通
- [x] HTML 正文提取（Defuddle → MD）
- [x] PDF 文本提取（background fetch + pdf.js）
- [x] 事件溯源会话日志 + deriveMessages + IndexedDB 持久化（Dexie）
- [x] 会话按 origin 分组的历史列表；多 URL 会话；URL 变化自动注入新页面
- [x] SSE 流式聊天；思考模式开关；思维链折叠；Markdown 渲染
- [x] 划词批注（页面 + 对话内）、chip 列表、协议块、Annotation N 回复 chip
- [x] 草稿持久化与恢复（批注 + 输入框；页面高亮精确匹配恢复）
- [x] 工具：web_search / web_fetch / ask_user
- [x] persona / 全局指令 / per-origin 站点指令（字节预算）/ time-context
- [x] compaction（阈值摘要 + 溢出重试）
- [x] 设置页：API key / baseURL / 模型 / 思考模式默认 / persona / 指令

## 11. 明确排除（MVP 不做）

- 图片/OCR/视觉理解（留多模态消息结构接口）
- 自建 PDF 查看器与 PDF 页内批注
- 多设备同步（需自建后端）
- RAG / 向量索引（1M 上下文 + compaction 已够）
- 模糊锚定（精确匹配 + 降级策略）
- 会话导出备份（v1.1 候选）
