import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeShiki from '@shikijs/rehype';

const mdxPlugin = mdx({
  providerImportSource: '@mdx-js/react',
  remarkPlugins: [remarkGfm],
  // Footnotes ([^1]) become a visible "Sources" section at the end of the page.
  remarkRehypeOptions: { footnoteLabel: 'Sources', footnoteLabelTagName: 'h2', footnoteLabelProperties: { id: 'sources' }, footnoteBackLabel: 'Back to the text' },
  rehypePlugins: [
    rehypeSlug,
    [rehypeShiki, { themes: { light: 'github-light', dark: 'github-dark' } }],
  ],
});

export default defineConfig({
  plugins: [
    {
      ...mdxPlugin,
      enforce: 'pre',
      // Leave `page.mdx?raw` (used by search) as plain text.
      transform(code, id) {
        if (id.includes('?')) return null;
        return (mdxPlugin.transform as Function).call(this, code, id);
      },
    },
    react({ include: /\.(mdx|tsx|ts|jsx|js)$/ }),
    tailwindcss(),
  ],
});
