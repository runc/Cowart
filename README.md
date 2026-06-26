# Cowart

Cowart 是一个完全运行在浏览器里的无限画布 + AI 图像生成工具。它基于 tldraw 提供可视化画布，用 Vercel AI SDK 驱动多步智能体工作流，支持多图像 provider（BYOK），无需任何后端。

> 历史背景：Cowart 早期是一个 Codex 插件，依赖 Codex 宿主来生成和编排图片。本版本去掉了 Codex 依赖，改为纯浏览器 + AI SDK 的独立架构。

English README: [README.en.md](README.en.md)

## 功能

- 🎨 基于 tldraw 的无限画布，支持图形、文字、箭头、标注。
- 🤖 内置 AI 助手（Vercel AI SDK），通过工具调用自动完成「读选区 → 生成 → 避障插入」的多步工作流。
- 🖼️ 多图像 provider 支持（OpenAI gpt-image-1 / 字节 Seedream / Qwen 通义万相 / Gemini Nano Banana），BYOK，可在设置里切换。
- 📐 AI 图片占位框（AI 图片 holder）带比例预设，生成时按比例构图。
- ✏️ 标注驱动的图片编辑：对图片标注后，让 AI 生成去标注的修订图并放在原图旁。
- 💾 数据全部存在浏览器 IndexedDB，无需后端，`npm run build` 即得纯静态站点。

## 快速开始

```bash
npm install
npm run dev      # 本地开发，打开终端里打印的地址
npm run build    # 纯静态产物输出到 dist/
```

构建产物是纯静态文件，可以部署到任意静态托管（GitHub Pages、Vercel、Netlify、本地文件皆可）。

## 配置 AI Provider（重要）

打开画布右下角的 **⚙ 设置**，分别配置**图像生成模型**和 **LLM 编排模型**——两者独立设置，各自保管密钥，互不复用。这是让 AI 功能跑起来的前提。

### 图像生成模型

| Provider | 协议 | 模式 | 说明 |
|---|---|---|---|
| OpenAI gpt-image-1 | OpenAI 同步 | 需代理 | 支持图像编辑。 |
| 字节 Seedream（火山方舟） | OpenAI 兼容 | 需代理 | 走 Ark `base_url`，支持编辑。 |
| Qwen 通义万相 | DashScope 异步 | 需代理 | 原生异步（创建任务→轮询），支持 wanx2.1。 |
| Gemini Nano Banana | Gemini 多模态 | 需代理 | `generateContent` 内联返回，支持编辑。 |

### LLM 编排模型（驱动 AI 助手）

全部 OpenAI 兼容协议，填 endpoint + key + 模型名即可：

| Provider | 默认模型 | 默认 Endpoint |
|---|---|---|
| OpenAI | gpt-4o | api.openai.com/v1 |
| Qwen 通义千问 | qwen-plus | dashscope compatible-mode/v1 |
| DeepSeek | deepseek-chat | api.deepseek.com/v1 |
| 字节 Doubao | doubao-pro-32k | ark 火山方舟 |
| 自定义 OpenAI 兼容 | （自填） | （自填） |

> **关于 CORS（关键约束）**：浏览器无法绕过 provider 官方 API 的 CORS 限制。所有支持的 provider 官方均屏蔽 CORS，必须由你提供代理 URL（自建 serverless / 反向代理），否则浏览器会拦截请求。

> **密钥安全**：BYOK 模式下密钥仅存于本机浏览器（IndexedDB），不会上传任何服务器。但浏览器内的密钥仍可被本机脚本读取，请使用额度受限的 key。

## 使用

### 生成新图

1. 用工具栏的 **AI 图片** 工具创建一个占位框并选中它。
2. 点击右下角 **✨ AI 助手**，输入例如「生成一张日落海报」。
3. AI 会读取占位框比例，生成图片并自动插入占位框。

### 标注驱动编辑

1. 用 **标注** 工具在图片上画箭头、写批注。
2. 选中原图，在 AI 助手里描述修改意图，例如「按标注把背景改成蓝色」。
3. AI 会生成去除标注痕迹的修订图，放在原图右侧（原图和标注不动）。

## 架构

```
src/
├── App.jsx                 # tldraw 画布主组件 + AI holder / 标注工具
├── canvasSnapshot.js       # 画布快照校验/迁移/清理（纯函数）
├── lib/
│   ├── storage.js          # IndexedDB 持久化（画布/选区/视图/设置）
│   ├── placement.js        # 几何布局算法（避障/包围盒）
│   ├── imageFormat.js      # PNG/JPEG/WebP 尺寸解析（浏览器版）
│   └── settings.js         # 双区设置读写（image / orchestrator 独立）
├── models/                 # 模型接入层（双区统一抽象）
│   ├── presets.js          # provider 预设表（图像5个 + 编排5个，含协议/CORS/默认值）
│   ├── cors.js             # CORS 模型 + resolveEndpoint（直连/代理路由）
│   ├── imageAdapters.js    # 4 个图像协议适配器：openai-image / dashscope-image / gemini-image / comfyui
│   ├── chatAdapters.js     # LLM 编排适配器：openai-chat（createOpenAI，Qwen/DeepSeek/字节/OpenAI 共用）
│   └── resolve.js          # 统一解析入口：getImageProvider / getOrchestratorModel
├── agent/
│   ├── tools.js            # AI SDK 工具定义（get_selection/generate_image/insert_image/edit_image）
│   ├── runner.js           # streamText 多步编排循环
│   └── prompts.js          # 系统提示词
└── ui/
    ├── SettingsPanel.jsx   # 双区设置面板（图像模型 / LLM 编排，独立配置）
    └── AIPanel.jsx         # AI 助手聊天面板（流式 UI + 工具执行状态）
```

### 去 Codex 化映射

| 原架构（Codex 插件） | 新架构（纯浏览器） |
|---|---|
| Codex SKILL.md + MCP 工具循环 | AI SDK `streamText` + tools 多步循环 |
| Codex `imagegen` 技能 | Provider 适配层（OpenAI/字节 Seedream/Qwen 通义万相/Gemini） |
| Vite 中间件 + 文件系统存储 | IndexedDB + BroadcastChannel |
| MCP `insert_cowart_image`（文件 + 几何） | `lib/placement.js`（纯几何）+ tldraw 直接写入 |

## 本地开发

```bash
npm install
npm run dev
npm run build
```

## 开发者

ZHONG XIN  
zhongxin123456@gmail.com  
https://www.jiqiren.ai

## 致谢

Cowart 的画布能力基于 [tldraw/tldraw](https://github.com/tldraw/tldraw) 实现，AI 编排基于 [Vercel AI SDK](https://ai-sdk.dev/)。
