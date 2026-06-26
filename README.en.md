# Cowart

> This repository is a fork at [runc/Cowart](https://github.com/runc/Cowart), rebuilt as a standalone browser app on top of the original project. See the [original project section](#original-cowart) below.

Cowart is a fully browser-based infinite canvas + AI image generation tool. It uses tldraw for the visual canvas, Vercel AI SDK for multi-step agent workflows, and supports multiple image providers (BYOK) with no backend required.

中文说明: [README.md](README.md)

## Features

- 🎨 tldraw-powered infinite canvas with shapes, text, arrows, and annotations.
- 🤖 Built-in AI assistant (Vercel AI SDK) with tool-calling workflows: read selection → generate → place without overlap.
- 🖼️ Multiple image providers (OpenAI gpt-image-1 / ByteDance Seedream / Qwen / Gemini Nano Banana), BYOK, switchable in settings.
- 📐 AI image holders with aspect-ratio presets for composition-aware generation.
- ✏️ Annotation-driven editing: annotate an image, then let AI generate a clean revision beside the original.
- 💾 All data stored in browser IndexedDB; `npm run build` produces a static site with no backend.

## Quick Start

```bash
npm install
npm run dev      # local dev — open the URL printed in the terminal
npm run build    # static output in dist/
```

The build is a static site deployable to GitHub Pages, Vercel, Netlify, or any static host.

## Configure AI Providers (Important)

Open **⚙ Settings** in the bottom-right corner and configure **image generation** and **LLM orchestration** separately — each has its own API key and does not share credentials with the other.

### Image Generation

| Provider | Protocol | Mode | Notes |
|---|---|---|---|
| OpenAI gpt-image-1 | OpenAI sync | Proxy required | Supports image editing. |
| ByteDance Seedream (Volcengine Ark) | OpenAI-compatible | Proxy required | Uses Ark `base_url`; supports editing. |
| Qwen | DashScope async | Proxy required | Native async (create task → poll); supports wanx2.1. |
| Gemini Nano Banana | Gemini multimodal | Proxy required | Inline `generateContent` response; supports editing. |

### LLM Orchestration (AI Assistant)

All use OpenAI-compatible protocol — set endpoint + key + model name:

| Provider | Default Model | Default Endpoint |
|---|---|---|
| OpenAI | gpt-4o | api.openai.com/v1 |
| Qwen | qwen-plus | dashscope compatible-mode/v1 |
| DeepSeek | deepseek-chat | api.deepseek.com/v1 |
| ByteDance Doubao | doubao-pro-32k | Volcengine Ark |
| Custom OpenAI-compatible | (your choice) | (your choice) |

> **CORS constraint**: Browser cannot bypass provider CORS restrictions. All supported providers block CORS by default — you must supply a proxy URL (self-hosted serverless / reverse proxy) or the browser will block requests.

> **Key security**: In BYOK mode, keys are stored only in local browser IndexedDB and never uploaded to any server. Keys in the browser can still be read by local scripts — use quota-limited keys.

## Usage

### Generate a New Image

1. Create an **AI Image** holder with the toolbar tool and select it.
2. Click **✨ AI Assistant** in the bottom-right and type e.g. "generate a sunset poster".
3. AI reads the holder aspect ratio, generates the image, and inserts it automatically.

### Annotation-Driven Editing

1. Use the **Annotate** tool to draw arrows and notes on an image.
2. Select the original image and describe your intent in the AI assistant, e.g. "change the background to blue per the annotations".
3. AI generates a clean revision to the right of the original (original and annotations stay untouched).

## Architecture

```
src/
├── App.jsx                 # tldraw canvas + AI holder / annotation tools
├── canvasSnapshot.js       # snapshot validation/migration/cleanup (pure functions)
├── lib/
│   ├── storage.js          # IndexedDB persistence (canvas/selection/view/settings)
│   ├── placement.js        # geometry layout (collision avoidance / bounding box)
│   ├── imageFormat.js      # PNG/JPEG/WebP dimension parsing (browser)
│   └── settings.js         # dual-zone settings (image / orchestrator)
├── models/                 # model adapter layer
│   ├── presets.js          # provider presets (image + orchestrator)
│   ├── cors.js             # CORS model + resolveEndpoint
│   ├── imageAdapters.js    # image protocol adapters
│   ├── chatAdapters.js     # LLM orchestration adapter
│   └── resolve.js          # getImageProvider / getOrchestratorModel
├── agent/
│   ├── tools.js            # AI SDK tool definitions
│   ├── runner.js           # streamText multi-step loop
│   └── prompts.js          # system prompts
└── ui/
    ├── SettingsPanel.jsx   # dual-zone settings panel
    └── AIPanel.jsx         # AI assistant chat panel
```

### De-Codex Mapping

| Original (Codex plugin) | New (browser-only) |
|---|---|
| Codex SKILL.md + MCP tool loop | AI SDK `streamText` + tools loop |
| Codex `imagegen` skill | Provider adapter layer |
| Vite middleware + filesystem storage | IndexedDB + BroadcastChannel |
| MCP `insert_cowart_image` | `lib/placement.js` + direct tldraw writes |

## Local Development

```bash
npm install
npm run dev
npm run build
```

## Maintainer

[runc](https://github.com/runc)

## Acknowledgments

Canvas capabilities built on [tldraw/tldraw](https://github.com/tldraw/tldraw); AI orchestration on [Vercel AI SDK](https://ai-sdk.dev/).

---

## Original Cowart

> **Tribute to the original author**
>
> Cowart was originally created by **[ZHONG XIN (zhongerxin)](https://github.com/zhongerxin)** — an elegant Codex local infinite-canvas plugin that integrates tldraw, AI image holders, annotation-driven editing, and MCP tools with remarkable clarity. This fork is built on that open-source foundation; sincere thanks to the author for the pioneering work.
>
> Original repository: [https://github.com/zhongerxin/Cowart](https://github.com/zhongerxin/Cowart)

Cowart is a local infinite-canvas plugin for Codex. It brings a tldraw-powered canvas into Codex for visual thinking, annotation, image generation, and annotation-driven image edits. The canvas runs as a local web service, and its data is saved in the active user project under `canvas/` instead of inside the plugin repository.

### Features

- Open a local tldraw infinite canvas from Codex.
- Persist canvas pages and image assets in the active project directory.
- Create AI image holders on the canvas and ask Codex to generate images into the selected holder.
- Provide Cowart annotation screenshots and let Codex generate clean revised images beside the original.
- Use Cowart MCP tools to read selection state, insert images, and save page-local assets.

### Installation

#### Ask Codex To Install It

Send the following message to Codex:

```text
Please install the Cowart Codex plugin from https://github.com/zhongerxin/cowart.git.
Clone the repository into ~/plugins/cowart, verify that .codex-plugin/plugin.json exists,
add the plugin to the personal marketplace, run codex plugin marketplace add ~,
then run codex plugin add cowart@personal.
After installing, validate the plugin and tell me whether I should start a new conversation to load the new skills and MCP tools.
```

#### Manual Install

Clone the plugin into the default location referenced by the Codex personal marketplace:

```bash
mkdir -p ~/plugins
git clone https://github.com/zhongerxin/cowart.git ~/plugins/cowart
cd ~/plugins/cowart
npm install
npm run build
```

Make sure `~/.agents/plugins/marketplace.json` contains a Cowart entry:

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

Then register the personal marketplace and install the plugin:

```bash
codex plugin marketplace add ~
codex plugin add cowart@personal
```

After installing, start a new Codex conversation so the new skills and MCP tools are loaded cleanly.

### Usage

#### Open The Canvas

Ask Codex:

```text
Open the Cowart canvas for this project.
```

Cowart starts a local service at:

```text
http://127.0.0.1:43217/
```

Canvas data is saved in the active project:

```text
canvas/pages/<page-id>/cowart-canvas.json
canvas/pages/<page-id>/assets/
```

![Open Cowart canvas in Codex](assets/open-canvas.png)

#### Generate A New Image

1. Open the Cowart canvas.
2. Create and select an AI image holder on the canvas.
3. Describe the image you want Codex to generate, for example:

```text
Generate a new image into the selected Cowart AI image holder.
```

Codex reads the selected holder, matches its aspect ratio, generates the image, and inserts it into the holder.

![Generate and insert a new image with Cowart](assets/generate-image.png)

#### Generate From An Annotation Screenshot

1. Annotate an image on the Cowart canvas.
2. Take a screenshot of the annotated image and send it to Codex.
3. Use this prompt:

```text
Use my Cowart annotation screenshot to generate a clean revised image beside the original.
```

Codex reads the notes and arrows in the screenshot, generates a clean revised image without annotation artifacts, and places it beside the original. The original image and annotations are not deleted or moved.

![Generate a revised image from a Cowart annotation screenshot](assets/annotation-edit.png)

### Skills

- `cowart:cowart-open-canvas`: open the local Cowart canvas.
- `cowart:cowart-image-gen`: insert a generated image into the selected AI image holder.
- `cowart:cowart-image-edit`: generate a revised image from a user-provided Cowart annotation screenshot.

### Local Development

```bash
npm install
npm run dev
npm run build
```

You can also start the canvas service directly and pass the active user project directory:

```bash
./scripts/start-canvas.sh /path/to/user/project
```

Useful environment variables:

- `COWART_PORT`: local service port, default `43217`.
- `COWART_PROJECT_DIR`: the user project directory that owns the canvas data.
- `COWART_CANVAS_DIR`: canvas data directory, default `$COWART_PROJECT_DIR/canvas`.

### Developer

ZHONG XIN  
zhongxin123456@gmail.com  
https://www.jiqiren.ai

### Acknowledgments

Cowart's canvas experience is built on top of [tldraw/tldraw](https://github.com/tldraw/tldraw).
