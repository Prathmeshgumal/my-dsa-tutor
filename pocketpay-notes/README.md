# PocketPay Notes

Notes from learning payments backend + AI engineering by building PocketPay.
Vite + React + MDX + Tailwind.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

In project-me, `./start.sh` also serves the built site at http://localhost:5200 (see
`DECISIONS.md`). That copy updates on `./start.sh --build`; `npm run dev` is for live editing.

## Add a page

Create `src/content/<folder>/<name>.mdx`. The file path becomes the URL
(`src/content/day-1/ledger.mdx` → `/day-1/ledger`). Start it with:

```js
export const meta = { title: 'Double-entry ledger', description: '…', section: 'Day 1: payments backend', order: 2, label: '2. Ledger' };
```

`section` must be one of `SECTIONS` in `src/content.ts`. It shows up in the sidebar,
search and prev/next links automatically.

## Components usable in any page without importing

`<Callout title="…" tone="note|caution">`, `<UpiFlow />`, `<WeekendPlan />`.
Register new ones in `src/components/mdx.tsx`.

Block progress and links to notes live in `src/data/blocks.ts`.
