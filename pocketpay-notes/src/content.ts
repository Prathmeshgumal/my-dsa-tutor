import type { ComponentType } from 'react';

// Every .mdx file under src/content is a page. Its URL comes from its path,
// and its place in the sidebar comes from the `meta` it exports.
export type Meta = {
  title: string;
  description?: string;
  section: string;
  order: number;
  label?: string;
};

export type Page = Meta & {
  path: string;
  Component: ComponentType;
  text: string;
};

export const SECTIONS = ['Weekend plan', 'Start here', 'Day 1: payments backend', 'Day 2: AI on top'];

const modules = import.meta.glob<{ default: ComponentType; meta: Meta }>('./content/**/*.mdx', { eager: true });
const raw = import.meta.glob<string>('./content/**/*.mdx', { eager: true, query: '?raw', import: 'default' });

const toPath = (file: string) => {
  const slug = file.replace('./content/', '').replace(/\.mdx$/, '').replace(/(^|\/)index$/, '');
  return '/' + slug;
};

// Rough plain text for search: drop imports, exports, JSX tags and markdown symbols.
const toText = (source: string) =>
  source
    .replace(/^(import|export)[\s\S]*?;$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*`|>_[\]()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const pages: Page[] = Object.entries(modules)
  .map(([file, mod]) => ({ ...mod.meta, path: toPath(file), Component: mod.default, text: toText(raw[file] ?? '') }))
  .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.order - b.order);

