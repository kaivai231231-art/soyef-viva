# Viva Study

Bengali-friendly, local-first viva preparation workspace.

## Included

- React + Vite source code
- Built output in `artifacts/viva-study/dist/public`
- IndexedDB persistence with Dexie
- Question cards, active recall, spaced review, targets, progress
- JSON backup/import
- Local AI provider settings for Gemini/OpenAI-compatible APIs
- PWA manifest and service worker

## Run locally

Requirements: Node.js and pnpm.

```bash
pnpm install
PORT=22039 BASE_PATH=/ pnpm --filter @workspace/viva-study run dev
```

For a production build:

```bash
PORT=22039 BASE_PATH=/ pnpm --filter @workspace/viva-study run build
```

API keys are entered in the app and stored locally in the browser's IndexedDB. They are not included in JSON backups or this ZIP.
