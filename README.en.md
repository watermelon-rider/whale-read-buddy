# WhaleRead Buddy

> A whale-girl reading companion living in your browser's side panel: reads web pages and PDFs, and chats with you until everything clicks.

**中文版：[README.md](README.md)**

![icon](public/icons/icon-128.png)

## What is this

A Chrome extension (MV3). Open any web page or PDF, click the toolbar icon, and WhaleBuddy appears in the side panel — she has already read the page you're on, so you can start chatting right away. Powered by the DeepSeek API (`deepseek-flash` / `deepseek-v4-pro`, 1M context, thinking mode with adjustable effort).

## Features

- **Instant reading**: your first message automatically carries the current page's content (HTML extracted to clean Markdown; PDF text layer); navigating between pages mid-conversation injects new content — one conversation can span many pages.
- **Select-to-annotate**: select text on the page or inside the chat → an in-place annotation card → notes accumulate as chips and ship with your question; the model replies with "Annotation N: …" per note, and each label in the reply opens the original quote + note on click.
- **Proactive search**: the model decides when to look things up via DeepSeek's official Search/Fetch APIs (same API key), with source citations.
- **Structured questions**: when WhaleBuddy needs input, she pops up an option card (A/B/C click-to-answer); close it without answering and the card waits for you in place next time.
- **Rich rendering**: KaTeX math, Mermaid flow/sequence diagrams, callouts (NOTE/TIP/WARNING), step bars, timelines, sortable tables; any figure can be cast to a full browser window with zoom & pan.
- **Playable persona**: a tsundere whale girl by default; persona, global system prompt, and per-conversation prompt are all editable — changes take effect on the very next message.
- **Persistent sessions**: history grouped by site, rename, delete with confirmation, unsent annotation drafts restored, scroll-position memory.
- **Bilingual**: UI and prompts follow your browser language — 大肥鱼陪读 in Chinese, WhaleRead Buddy in English.

## Privacy

- Your API key lives only in the browser's `chrome.storage.local` — **never synced, never shared**;
- Page content and conversations go only to the DeepSeek endpoint you configured;
- Page extraction happens entirely locally. No third-party services.

## Install

**Option 1: prebuilt zip (recommended)**

Grab the latest `whale-read-buddy-*-chrome.zip` from [Releases](https://github.com/watermelon-rider/whale-read-buddy/releases), unzip, then in `chrome://extensions` enable Developer mode → "Load unpacked" → pick the unzipped folder.

**Option 2: build it yourself**

```sh
pnpm install
pnpm build        # output in .output/chrome-mv3/
```

Then load `.output/chrome-mv3/` from `chrome://extensions` the same way.

After installing, click the toolbar icon to open the side panel and paste your DeepSeek API key in ⚙ Settings (create one at [platform.deepseek.com](https://platform.deepseek.com)).

## Develop

```sh
pnpm dev        # dev mode with HMR
pnpm build      # production build
pnpm test       # unit tests for core logic (vitest)
pnpm compile    # type check
```

Stack: WXT + React + TypeScript + Dexie (IndexedDB). Architecture & design decisions: [docs/DESIGN.md](docs/DESIGN.md) (Chinese).

## Browser support

Chrome only (MV3, side panel). Other browsers are not supported.
