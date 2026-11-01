import type { ReactNode } from 'react';

const tones = {
  note: 'border-sat bg-sat-soft',
  caution: 'border-sun bg-sun-soft',
};

export default function Callout({ title, tone = 'note', children }: { title: string; tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <aside className={`not-prose my-6 rounded-r-lg border-l-4 px-5 py-4 ${tones[tone]}`}>
      <p className="mb-1 font-bold">{title}</p>
      <div className="leading-relaxed [&>p]:m-0">{children}</div>
    </aside>
  );
}
