import { useEffect, useState } from 'react';

type Heading = { id: string; text: string; level: number };

// "On this page": reads the rendered h2/h3s and highlights the one you're reading.
export default function Toc() {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('article h2[id], article h3[id]')];
    setHeadings(els.map((el) => ({ id: el.id, text: el.textContent ?? '', level: el.tagName === 'H2' ? 2 : 3 })));

    const onScroll = () => {
      const current = els.filter((el) => el.getBoundingClientRect().top < 120).pop();
      setActive(current?.id ?? '');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (headings.length < 2) return <div className="hidden w-64 shrink-0 xl:block" />;

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto py-10 pr-6 xl:block">
      <p className="mb-3 font-bold">On this page</p>
      <ul className="space-y-1.5 text-sm">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? 'pl-4' : ''}>
            <a href={`#${h.id}`} className={active === h.id ? 'font-medium text-sat' : 'text-muted hover:text-ink'}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
