import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { MDXProvider } from '@mdx-js/react';
import { pages, SECTIONS, type Page } from './content';
import { mdxComponents } from './components/mdx';
import Search from './components/Search';
import Toc from './components/Toc';
import ThemeToggle from './components/ThemeToggle';

export default function App() {
  const [navOpen, setNavOpen] = useState(false);
  // Wide screens only: the sidebar can be hidden for more reading room. Remembered between visits.
  const [navHidden, setNavHidden] = useState(readNavHidden);

  useEffect(() => {
    try {
      navHidden ? localStorage.setItem('navHidden', '1') : localStorage.removeItem('navHidden');
    } catch {}
  }, [navHidden]);
  const { pathname, hash } = useLocation();

  // New page: close the mobile nav and jump to the top (or to the #heading).
  useEffect(() => {
    setNavOpen(false);
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-rule bg-paper/90 px-4 backdrop-blur sm:px-6">
        <button
          className="rounded-md border border-rule px-2.5 py-1.5 text-sm font-medium lg:hidden"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-controls="sidebar"
        >
          Menu
        </button>
        <button
          className="hidden rounded-md border border-rule p-1.5 text-muted hover:text-ink lg:inline-flex"
          onClick={() => setNavHidden((h) => !h)}
          aria-expanded={!navHidden}
          aria-controls="sidebar"
          aria-label={navHidden ? 'Show sidebar' : 'Hide sidebar'}
          title={navHidden ? 'Show sidebar' : 'Hide sidebar'}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            {navHidden ? <path d="M13 10l2 2-2 2" /> : <path d="M15 10l-2 2 2 2" />}
          </svg>
        </button>
        <Link to="/" className="text-xl font-black tracking-tight whitespace-nowrap text-sat">
          PocketPay<span className="hidden sm:inline"> Notes</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Search />
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <nav
          id="sidebar"
          className={`${navOpen ? 'block' : 'hidden'} fixed inset-x-0 top-16 bottom-0 z-20 overflow-y-auto bg-paper px-4 py-6 lg:sticky ${navHidden ? 'lg:hidden' : 'lg:block'} lg:h-[calc(100vh-4rem)] lg:w-72 lg:shrink-0 lg:border-r lg:border-rule`}
        >
          {SECTIONS.map((section) => {
            const items = pages.filter((p) => p.section === section);
            if (!items.length) return null;
            return (
              <div key={section} className="mb-6">
                <p className="mb-2 px-2 font-bold">{section}</p>
                <ul className="space-y-0.5 border-l border-rule pl-2">
                  {items.map((p) => (
                    <li key={p.path}>
                      <NavLink
                        to={p.path}
                        end
                        className={({ isActive }) =>
                          `block rounded-md px-2.5 py-1.5 text-[0.95rem] ${isActive ? 'bg-sat font-medium text-on-sat' : 'text-muted hover:text-ink'}`
                        }
                      >
                        {p.label ?? p.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <MDXProvider components={mdxComponents}>
          <Routes>
            {pages.map((p) => (
              <Route key={p.path} path={p.path} element={<PageView page={p} />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MDXProvider>
      </div>
    </div>
  );
}

function readNavHidden() {
  try {
    return localStorage.getItem('navHidden') === '1';
  } catch {
    return false;
  }
}

function PageView({ page }: { page: Page }) {
  const { Component } = page;
  const i = pages.indexOf(page);
  const prev = pages[i - 1];
  const next = pages[i + 1];

  useEffect(() => {
    document.title = `${page.title} | PocketPay Notes`;
  }, [page]);

  return (
    <>
      <main className="min-w-0 flex-1 px-4 py-10 sm:px-10">
        <article className="prose mx-auto lg:prose-lg">
          <h1 className="mb-3 text-[clamp(2.2rem,5vw,3.4rem)] leading-none font-black tracking-[-0.035em]">{page.title}</h1>
          {page.description && <p className="lead mt-0">{page.description}</p>}
          <Component />
        </article>

        <div className="not-prose mx-auto mt-16 grid max-w-[72ch] gap-3 border-t border-rule pt-6 sm:grid-cols-2">
          {prev ? <PagerLink page={prev} dir="Previous" /> : <span />}
          {next && <PagerLink page={next} dir="Next" />}
        </div>
      </main>
      <Toc key={page.path} />
    </>
  );
}

function PagerLink({ page, dir }: { page: Page; dir: string }) {
  return (
    <Link
      to={page.path}
      className={`rounded-lg border border-rule px-4 py-3 hover:border-sat ${dir === 'Next' ? 'sm:col-start-2 sm:text-right' : ''}`}
    >
      <span className="block text-sm text-muted">{dir}</span>
      <span className="font-bold">{page.label ?? page.title}</span>
    </Link>
  );
}

function NotFound() {
  return (
    <main className="flex-1 px-6 py-20">
      <h1 className="text-4xl font-black">This page doesn’t exist yet</h1>
      <p className="mt-3 text-muted">It may be a block we haven’t reached. Pick a page from the sidebar.</p>
      <Link to="/" className="mt-6 inline-block font-medium text-sat underline underline-offset-4">
        Go to the weekend plan
      </Link>
    </main>
  );
}
