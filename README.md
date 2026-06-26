# Cowart

> 本仓库为 [runc/Cowart](https://github.com/runc/Cowart) 二开版本，在原作者基础上改造为纯浏览器独立应用。原项目说明见 [下文](#原项目-cowart)。

Cowart 是一个完全运行在浏览器里的无限画布 + AI 图像生成工具。它基于 tldraw 提供可视化画布，用 Vercel AI SDK 驱动多步智能体工作流，支持多图像 provider（BYOK），无需任何后端。

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

## 维护者

[runc](https://github.com/runc)

## 致谢

Cowart 的画布能力基于 [tldraw/tldraw](https://github.com/tldraw/tldraw) 实现，AI 编排基于 [Vercel AI SDK](https://ai-sdk.dev/)。

---

## 原项目 Cowart

> **致敬原作者**
>
> Cowart 最初由 **[ZHONG XIN（zhongerxin）](https://github.com/zhongerxin)** 创建，是一个面向 Codex 的本地无限画布插件，将 tldraw 画布、AI 图片占位、标注驱动编辑与 MCP 工具有机整合，设计简洁而实用。本仓库在其开源基础上进行二次开发，向原作者的开创性工作致以诚挚敬意。
>
> 原仓库：[https://github.com/zhongerxin/Cowart](https://github.com/zhongerxin/Cowart)

Cowart 是一个面向 Codex 的本地无限画布插件。它基于 tldraw 提供可视化画布，用于构思、标注、生成图片和根据标注图迭代图片。画布运行在本地网页服务中，数据默认保存到当前用户项目的 `canvas/` 目录，而不是保存到插件仓库里。

### 功能

- 在 Codex 中打开一个本地 tldraw 无限画布。
- 在当前项目目录中持久化画布页面和图片资源。
- 在画布中创建 AI image holder，并让 Codex 生成图片填入选中的 holder。
- 上传或提供 Cowart 标注截图，让 Codex 根据标注生成干净的新图并放到原图旁边。
- 通过 Cowart MCP 工具读取选择状态、插入图片，并保存到页面本地资源目录。

### 安装

#### 让 Codex 自动安装

把下面这段发给 Codex：

```text
请从 https://github.com/zhongerxin/cowart.git 安装 Cowart Codex 插件。
请 clone 仓库到 ~/plugins/cowart，确认 .codex-plugin/plugin.json 存在，
把插件加入 personal marketplace，先运行 codex plugin marketplace add ~，
再运行 codex plugin add cowart@personal。
安装后请校验插件，并告诉我是否需要开启一个新对话来加载新技能和 MCP 工具。
```

#### 手动安装

推荐把插件 clone 到 Codex personal marketplace 默认会引用的位置：

```bash
mkdir -p ~/plugins
git clone https://github.com/zhongerxin/cowart.git ~/plugins/cowart
cd ~/plugins/cowart
npm install
npm run build
```

确保 `~/.agents/plugins/marketplace.json` 中有 Cowart 条目：

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "cowart",
      "source": {
        "source": "local",
        "path": "./plugins/cowart"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

然后先注册 personal marketplace，再安装插件：

```bash
codex plugin marketplace add ~
codex plugin add cowart@personal
```

安装后建议开启一个新的 Codex 对话，让新的 skill 和 MCP 工具完整加载。

### 使用

#### 打开画布

在 Codex 中说：

```text
Open the Cowart canvas for this project.
```

Cowart 会启动本地服务，默认地址是：

```text
http://127.0.0.1:43217/
```

画布数据会保存在当前项目目录下：

```text
canvas/pages/<page-id>/cowart-canvas.json
canvas/pages/<page-id>/assets/
```

![在 Codex 中打开 Cowart 画布](assets/open-canvas.png)

#### 生成新图

1. 打开 Cowart 画布。
2. 在画布里创建并选中一个 AI image holder。
3. 在 Codex 中描述要生成的图片，例如：

```text
Generate a new image into the selected Cowart AI image holder.
```

Codex 会读取选中的 holder，按它的比例生成图片，并插入到 holder 中。

![使用 Cowart 生成并插入新图](assets/generate-image.png)

#### 根据标注图生成新图

1. 在 Cowart 画布中对图片做标注。
2. 截图并把标注截图发给 Codex。
3. 使用提示：

```text
Use my Cowart annotation screenshot to generate a clean revised image beside the original.
```

Codex 会读取截图里的标注和箭头，生成去掉标注痕迹的新图，并把结果放在原图旁边。原图和标注不会被删除或移动。

![根据 Cowart 标注截图生成修订图](assets/annotation-edit.png)

### 技能

- `cowart:cowart-open-canvas`：打开 Cowart 本地画布。
- `cowart:cowart-image-gen`：把生成图片插入选中的 AI image holder。
- `cowart:cowart-image-edit`：根据用户提供的 Cowart 标注截图生成修订图。

### 本地开发

```bash
npm install
npm run dev
npm run build
```

也可以直接启动画布服务，并指定用户项目目录：

```bash
./scripts/start-canvas.sh /path/to/user/project
```

常用环境变量：

- `COWART_PORT`：本地服务端口，默认 `43217`。
- `COWART_PROJECT_DIR`：画布数据所属的用户项目目录。
- `COWART_CANVAS_DIR`：画布数据目录，默认是 `$COWART_PROJECT_DIR/canvas`。

### 开发者

ZHONG XIN  
zhongxin123456@gmail.com  
https://www.jiqiren.ai

### 致谢

Cowart 的画布能力基于 [tldraw/tldraw](https://github.com/tldraw/tldraw) 实现。
