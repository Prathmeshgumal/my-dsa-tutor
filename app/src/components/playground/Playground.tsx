import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronFirst,
  ChevronLast,
  Clapperboard,
  FileCode2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Kbd } from "@/components/Kbd";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatScalar, type DryRun } from "@/lib/dryRun";
import { cn } from "@/lib/utils";
import { usePlayground } from "@/state/playground";
import { useSettings } from "@/state/settings";
import { StructureView } from "./StructureView";

function timeAgo(at: number): string {
  if (!at) return "example";
  const minutes = Math.floor(Math.max(0, Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function RunRow({ run, active }: { run: DryRun; active: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
        active
          ? "bg-violet-500/10 ring-1 ring-violet-500/25 ring-inset"
          : "hover:bg-muted",
      )}
      onMouseLeave={() => setConfirming(false)}
    >
      <button
        type="button"
        onClick={() => usePlayground.getState().open(run.id)}
        className="min-w-0 flex-1 px-2.5 py-2 text-left"
      >
        <span className="block truncate text-[12.5px] text-foreground">
          {run.title}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[`${run.steps.length} steps`, run.file, timeAgo(run.createdAt)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {confirming ? (
        <Button
          size="sm"
          variant="destructive"
          aria-label={`Confirm delete dry run: ${run.title}`}
          onClick={() => void usePlayground.getState().remove(run.id)}
          className="h-6 px-2 text-[11px]"
        >
          <Check /> Delete
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete dry run: ${run.title}`}
          onClick={() => setConfirming(true)}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500 focus-visible:opacity-100"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function CodePanel({ code, line }: { code: string; line?: number }) {
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth",
    });
  }, [line]);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <ol
        aria-label="Code"
        className="py-2 font-mono text-[13px] leading-[1.6]"
      >
        {code.split("\n").map((text, i) => {
          const current = line === i + 1;
          return (
            <li
              key={i}
              ref={current ? currentRef : undefined}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex border-l-2 pr-3 transition-colors duration-200",
                current
                  ? "border-violet-500 bg-violet-500/12"
                  : "border-transparent",
              )}
            >
              <span
                className={cn(
                  "w-10 shrink-0 pr-3 text-right select-none",
                  current ? "text-violet-500" : "text-muted-foreground/60",
                )}
              >
                {i + 1}
              </span>
              <span className="whitespace-pre">{text || " "}</span>
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}

const SPEEDS = [0.5, 1, 2];

function Controls({ run }: { run: DryRun }) {
  const { step, playing, speed, next, prev, goTo, togglePlay, setSpeed } =
    usePlayground();
  const last = run.steps.length - 1;
  const icon = (
    label: string,
    onClick: () => void,
    children: React.ReactNode,
    disabled = false,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t px-3 py-2.5">
      <div className="flex items-center gap-0.5">
        {icon("First step", () => goTo(0), <ChevronFirst />, step === 0)}
        {icon("Previous step", prev, <SkipBack />, step === 0)}
        <Button
          size="sm"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="glow-shimmer mx-1 w-20 border-white/15 text-white"
        >
          {playing ? <Pause /> : <Play />} {playing ? "Pause" : "Play"}
        </Button>
        {icon("Next step", next, <SkipForward />, step === last)}
        {icon("Last step", () => goTo(last), <ChevronLast />, step === last)}
      </div>
      <input
        type="range"
        aria-label="Step"
        min={0}
        max={last}
        value={step}
        onChange={(e) => goTo(Number(e.target.value))}
        className="min-w-24 flex-1 accent-violet-500"
      />
      <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{`Step ${step + 1} of ${run.steps.length}`}</span>
      <div
        role="radiogroup"
        aria-label="Speed"
        className="flex shrink-0 rounded-md bg-muted p-0.5 text-[11.5px]"
      >
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            onClick={() => setSpeed(s)}
            className={cn(
              "rounded px-2 py-0.5 tabular-nums",
              speed === s
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

/** Width of an element, kept up to date (null until measured, e.g. in tests). */
function useWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number | null,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Side by side when there's room for both, stacked (code on top) when narrow. */
const SIDE_BY_SIDE_MIN = 720;

function Variable({
  name,
  value,
  changed,
}: {
  name: string;
  value: string;
  changed: boolean;
}) {
  return (
    <li data-testid="var-bucket" className="flex flex-col items-center gap-1">
      <span
        data-testid="var-name"
        className="max-w-28 truncate font-mono text-[11.5px] font-semibold text-muted-foreground"
      >
        {name}
      </span>
      {/* A bucket: open at the top (|_|), value inside. */}
      <span
        data-testid="var-value"
        className={cn(
          "grid h-10 min-w-12 place-items-center rounded-b-lg border-x-2 border-b-2 px-2.5 font-mono text-[14px] font-semibold transition-all duration-300",
          changed
            ? "border-violet-500 bg-violet-500/12 text-violet-700 dark:text-violet-200"
            : "border-muted-foreground/40 text-foreground",
        )}
      >
        {value}
      </span>
    </li>
  );
}

function Viewer({ run }: { run: DryRun }) {
  const stepIndex = usePlayground((s) => s.step);
  const step = run.steps[Math.min(stepIndex, run.steps.length - 1)];
  const before = stepIndex > 0 ? (run.steps[stepIndex - 1].vars ?? {}) : {};
  const vars = Object.entries(step.vars ?? {});
  const [ref, width] = useWidth<HTMLDivElement>();
  const sideBySide = width === null || width >= SIDE_BY_SIDE_MIN;
  const area = sideBySide ? "code-drawing" : "code-drawing-stacked";
  const saved = useSettings((s) => s.playgroundLayout[area]);

  const drawing = (
    <ScrollArea className="h-full min-h-0 min-w-0 flex-1">
      <div className="flex flex-col gap-5 p-4 @3xl:p-5">
        <div
          data-testid="step-note"
          aria-live="polite"
          className={cn(
            "rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed transition-colors",
            step.mistake
              ? "border-red-500/40 bg-red-500/10"
              : "border-violet-500/25 bg-violet-500/[0.06]",
          )}
        >
          {step.mistake && (
            <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5" aria-hidden /> Here’s the bug
            </span>
          )}
          <span className="mr-2 font-mono text-[11px] text-muted-foreground">
            {step.line ? `line ${step.line}` : `step ${stepIndex + 1}`}
          </span>
          {step.note}
        </div>

        {vars.length > 0 && (
          <ul
            aria-label="Variables"
            className="flex flex-wrap items-end gap-x-4 gap-y-3"
          >
            {vars.map(([k, v]) => (
              <Variable
                key={k}
                name={k}
                value={formatScalar(v)}
                changed={stepIndex > 0 && before[k] !== v}
              />
            ))}
          </ul>
        )}

        {(step.structures ?? []).map((s, i) => (
          <StructureView key={`${s.kind}-${s.name}-${i}`} structure={s} />
        ))}

        {step.output !== undefined && (
          <div>
            <div className="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
              Output so far
            </div>
            <pre
              data-testid="step-output"
              className="rounded-lg border bg-card px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap"
            >
              {step.output || " "}
            </pre>
          </div>
        )}
      </div>
    </ScrollArea>
  );

  return (
    // A container, so the layout follows the space left by the side panels, not the window.
    <div
      ref={ref}
      className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3">
        <h1 className="text-[15px] font-semibold">{run.title}</h1>
        {run.file && (
          <span className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground">
            <FileCode2 className="size-3" aria-hidden /> {run.file}
          </span>
        )}
        {run.input && (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            input{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">
              {run.input}
            </code>
          </span>
        )}
      </header>

      {run.code ? (
        <ResizablePanelGroup
          key={area}
          orientation={sideBySide ? "horizontal" : "vertical"}
          defaultLayout={
            saved ??
            (sideBySide ? { code: 42, drawing: 58 } : { code: 35, drawing: 65 })
          }
          onLayoutChanged={(l) =>
            useSettings.getState().setPlaygroundLayout(area, l)
          }
          className="min-h-0 flex-1"
        >
          <ResizablePanel
            id="code"
            minSize="15"
            className="flex min-h-0 min-w-0 flex-col bg-card/30"
          >
            <section
              aria-label="Code panel"
              className="flex min-h-0 flex-1 flex-col"
            >
              <CodePanel code={run.code} line={step.line} />
            </section>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="transition-colors hover:bg-violet-500/50 data-[separator=active]:bg-violet-500"
          />
          <ResizablePanel
            id="drawing"
            minSize="25"
            className="flex min-h-0 min-w-0 flex-col"
          >
            {drawing}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex min-h-0 flex-1">{drawing}</div>
      )}
      <Controls run={run} />
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25">
        <Clapperboard className="size-6" aria-hidden />
      </span>
      <div className="max-w-md space-y-1.5">
        <p className="text-[15px] font-medium">
          Watch your code run, step by step
        </p>
        <p className="text-[13px] text-muted-foreground">
          Ask Claude something like “dry run my code with input [3, 1, 2]” or
          “show me where my loop goes wrong”. Its dry run appears here with your
          code, the variables and the data structures drawn out.
        </p>
      </div>
      <Button
        variant="outline"
        onClick={() => usePlayground.getState().openExample()}
      >
        <Sparkles /> Watch an example
      </Button>
    </div>
  );
}

/** Full-screen view of dry-run visualizations. */
export function Playground() {
  const { runs, activeId } = usePlayground();
  const run = runs.find((r) => r.id === activeId) ?? null;
  const savedOuter = useSettings((s) => s.playgroundLayout["list-main"]);

  useEffect(() => {
    void usePlayground.getState().load();
  }, []);

  // ← → step, space plays/pauses, unless typing somewhere or on a button (which handles space itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest('input, textarea, [contenteditable="true"], .monaco-editor')
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const pg = usePlayground.getState();
      if (e.key === "ArrowRight") pg.next();
      else if (e.key === "ArrowLeft") pg.prev();
      else if (e.key === " " && !t?.closest("button")) pg.togglePlay();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main aria-label="Playground" className="flex min-h-0 min-w-0 flex-1">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={savedOuter ?? { list: 18, main: 82 }}
        onLayoutChanged={(l) =>
          useSettings.getState().setPlaygroundLayout("list-main", l)
        }
        className="min-h-0 min-w-0 flex-1"
      >
        <ResizablePanel
          id="list"
          minSize="10"
          maxSize="40"
          className="flex min-h-0 flex-col"
        >
          <aside className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <Clapperboard className="size-4 text-violet-500" aria-hidden />
              <span className="text-[13px] font-semibold">Playground</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {runs.length ? (
                <ul
                  aria-label="Dry runs"
                  className="flex flex-col gap-0.5 p-2 pt-0"
                >
                  {runs.map((r) => (
                    <RunRow key={r.id} run={r} active={r.id === activeId} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-[12px] text-muted-foreground">
                  No dry runs yet.
                </p>
              )}
            </ScrollArea>
            <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              <Kbd>←</Kbd> <Kbd>→</Kbd> step · <Kbd>Space</Kbd> play
            </p>
          </aside>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="transition-colors hover:bg-violet-500/50 data-[separator=active]:bg-violet-500"
        />
        <ResizablePanel
          id="main"
          minSize="40"
          className="flex min-h-0 min-w-0 flex-col"
        >
          {run ? <Viewer run={run} /> : <Empty />}
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
