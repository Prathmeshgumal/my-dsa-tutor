import { useEffect, useState, type ReactNode } from 'react';

// A diagram frame with a Full screen button, for diagrams wider than the text column. Escape closes it.
export default function ArchFigure({ label, children }: { label: string; children: ReactNode }) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [full]);

  return (
    <figure aria-label={label}
      className={`not-prose text-ink ${full ? 'fixed inset-0 z-50 overflow-auto bg-panel p-4 sm:p-8' : 'my-6 rounded-lg border border-rule bg-panel p-4 sm:p-5'}`}>
      <div className={full ? 'mx-auto max-w-[1500px]' : undefined}>
        <div className="mb-2 flex justify-end">
          <button onClick={() => setFull((f) => !f)} className="rounded-md border border-rule px-2.5 py-1 text-sm text-muted hover:text-ink">
            {full ? 'Close full screen (Esc)' : 'Full screen'}
          </button>
        </div>
        {children}
      </div>
    </figure>
  );
}
