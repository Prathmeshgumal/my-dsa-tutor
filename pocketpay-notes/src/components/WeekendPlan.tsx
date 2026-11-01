import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { blocks, type Block } from '../data/blocks';

const KEY = 'pocketpay-weekend-done';
const days = [
  { id: 'sat', name: 'Saturday: payments backend', when: 'Sat 31 Oct (started Fri 30 Oct evening)' },
  { id: 'sun', name: 'Sunday: AI on top', when: 'Sun 1 Nov' },
] as const;
const hoursFor = (day: string) => blocks.filter((b) => b.day === day).reduce((a, b) => a + b.hours, 0);

function loadDone(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export default function WeekendPlan() {
  const [done, setDone] = useState(loadDone);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...done]));
    } catch {}
  }, [done]);

  const toggle = (n: number) =>
    setDone((d) => {
      const copy = new Set(d);
      copy.has(n) ? copy.delete(n) : copy.add(n);
      return copy;
    });

  return (
    <div className="not-prose text-ink">
      <div className="my-6">
        {days.map((d) => (
          <div key={d.id} className="mb-5">
            <div className="mb-2 flex justify-between gap-3 text-[0.95rem]">
              <b>{d.name}</b>
              <span className="text-muted">{hoursFor(d.id)} h</span>
            </div>
            <div className="flex h-14 gap-[3px] sm:h-[74px]">
              {blocks.filter((b) => b.day === d.id).map((b, i) => (
                <Segment key={b.n} block={b} done={done.has(b.n)} delay={(d.id === 'sun' ? 300 : 0) + i * 60} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <span><i className="mr-1.5 inline-block h-3 w-[18px] rounded-sm bg-muted align-[-1px]" />Protect this block</span>
          <span><i className="hatch mr-1.5 inline-block h-3 w-[18px] rounded-sm align-[-1px] [--c:var(--muted)]" />Can be cut or moved to a weekday</span>
        </div>
        <p className="mt-4 font-medium" aria-live="polite">
          {done.size
            ? `${done.size} of ${blocks.length} blocks done.`
            : 'Tick a block when its checkpoint passes. Your progress shows up here and in the bars.'}
        </p>
      </div>

      {days.map((d) => (
        <section key={d.id} className="mt-10 border-t border-rule pt-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 id={d.id} className="m-0 text-[clamp(1.6rem,3.4vw,2.2rem)] font-black tracking-tight">{d.name}</h2>
            <span className="text-muted">{d.when}</span>
          </div>
          <ol className="mt-2">
            {blocks.filter((b) => b.day === d.id).map((b) => (
              <BlockRow key={b.n} block={b} done={done.has(b.n)} onToggle={() => toggle(b.n)} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Segment({ block: b, done, delay }: { block: Block; done: boolean; delay: number }) {
  const color = b.day === 'sat' ? 'var(--sat)' : 'var(--sun)';
  const solidText = b.day === 'sat' ? 'text-on-sat' : 'text-[#2a1e00]';
  return (
    <a
      href={`#block-${b.n}`}
      title={`Block ${b.n}: ${b.title} (${b.hours} h)`}
      style={{ flex: `${b.hours} 1 0`, animationDelay: `${delay}ms`, ['--c' as string]: color }}
      className={`grow-in relative flex min-w-0 flex-col items-center justify-between overflow-hidden rounded px-1 py-1.5 sm:items-start sm:px-2 ${
        b.protected ? `${solidText} bg-[var(--c)]` : 'hatch text-ink'
      } ${done ? 'opacity-40' : ''}`}
    >
      <span className="text-base leading-none font-black">{b.n}</span>
      <span className="hidden w-full truncate text-xs sm:block">{b.short}</span>
      {done && <span className="absolute top-1 right-2 font-black">✓</span>}
    </a>
  );
}

function BlockRow({ block: b, done, onToggle }: { block: Block; done: boolean; onToggle: () => void }) {
  return (
    <li id={`block-${b.n}`} className="grid scroll-mt-20 gap-x-5 border-b border-rule py-6 last:border-0 sm:grid-cols-[56px_1fr]">
      <div className={`mb-1 text-3xl leading-[0.9] font-black tracking-tighter sm:text-[2.6rem] ${b.day === 'sat' ? 'text-sat' : 'text-sun'}`}>{b.n}</div>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className={`m-0 text-xl font-bold ${done ? 'text-muted line-through decoration-2' : ''}`}>{b.title}</h3>
            <div className="mt-1 flex gap-3.5 text-sm text-muted">
              <span>{b.hours} h</span>
              <span className={`font-medium ${b.protected ? 'text-keep' : 'text-cut'}`}>{b.protected ? 'Protected' : 'Cuttable'}</span>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap text-muted">
            <input type="checkbox" checked={done} onChange={onToggle} className="h-5 w-5 cursor-pointer accent-[var(--keep)]" />
            Done
          </label>
        </div>
        <p className="my-3 max-w-[64ch]">{b.why}</p>
        <dl className="grid gap-x-4 gap-y-1.5 text-[0.95rem] sm:grid-cols-[7em_1fr]">
          <dt className="mt-2 text-muted sm:mt-0">Build</dt>
          <dd>{b.build}</dd>
          <dt className="mt-2 text-muted sm:mt-0">Checkpoint</dt>
          <dd className="font-medium">{b.check}</dd>
          <dt className="mt-2 text-muted sm:mt-0">Notes</dt>
          <dd>
            {b.notes ? (
              <Link to={b.notes} className="font-medium text-sat underline underline-offset-4">Read the notes for Block {b.n}</Link>
            ) : (
              <span className="text-muted italic">Written when we reach this block</span>
            )}
          </dd>
        </dl>
      </div>
    </li>
  );
}
