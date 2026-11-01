import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { pages } from '../content';

// Ctrl+K search over every page's title, description and text.
export default function Search() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pages
      .map((p) => {
        const inTitle = p.title.toLowerCase().includes(q);
        const at = p.text.toLowerCase().indexOf(q);
        if (!inTitle && at < 0) return null;
        const snippet = at >= 0 ? '…' + p.text.slice(Math.max(0, at - 50), at + q.length + 70) + '…' : p.description ?? '';
        return { page: p, snippet, score: inTitle ? 0 : 1 };
      })
      .filter((r) => r !== null)
      .sort((a, b) => a.score - b.score);
  }, [query]);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-md border border-rule bg-panel px-3 py-1.5 text-sm text-muted hover:text-ink"
      >
        Search
        <kbd className="hidden rounded bg-sat-soft px-1.5 font-sans text-xs sm:inline">Ctrl K</kbd>
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && setOpen(false)}
        className="m-auto mt-[12vh] w-[min(640px,calc(100vw-32px))] rounded-xl border border-rule bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/40"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, results.length - 1));
            if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0));
            if (e.key === 'Enter' && results[cursor]) go(results[cursor].page.path);
          }}
          placeholder="Search your notes, for example “idempotency” or “settlement”"
          className="w-full border-b border-rule bg-transparent px-5 py-4 text-lg outline-none"
        />
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {query && !results.length && <li className="px-3 py-4 text-muted">Nothing in your notes matches “{query}” yet.</li>}
          {results.map((r, i) => (
            <li key={r.page.path}>
              <button
                onClick={() => go(r.page.path)}
                onMouseEnter={() => setCursor(i)}
                className={`block w-full rounded-lg px-3 py-2.5 text-left ${i === cursor ? 'bg-sat-soft' : ''}`}
              >
                <span className="block font-bold">{r.page.title}</span>
                <span className="block text-sm text-muted">{r.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
