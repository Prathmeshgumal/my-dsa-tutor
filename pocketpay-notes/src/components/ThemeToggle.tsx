import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const label: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

function read(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    try {
      theme === 'system' ? localStorage.removeItem('theme') : localStorage.setItem('theme', theme);
    } catch {}
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(next[theme])}
      className="rounded-md border border-rule px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
      aria-label={`Theme: ${label[theme]}. Click to change.`}
    >
      {label[theme]}
    </button>
  );
}
