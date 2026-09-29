import { defineConfig } from 'astro/config';
import sanity from '@sanity/astro';
import sitemap from '@astrojs/sitemap';

// Páginas fora do sitemap: as marcadas noindex (e o 404, que o Astro já exclui).
const FORA_DO_SITEMAP = ['/carta-anual-alternativos'];

export default defineConfig({
  site: 'https://mzrfo.com.br',
  output: 'static',
  integrations: [
    sanity({
      projectId: 'xe11jg20',
      dataset: 'production',
      useCdn: true,
    }),
    sitemap({
      filter: (page) => !FORA_DO_SITEMAP.some((p) => new URL(page).pathname.replace(/\/$/, '') === p),
    }),
  ],
});
