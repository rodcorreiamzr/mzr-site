import { defineConfig } from 'astro/config';
import sanity from '@sanity/astro';

export default defineConfig({
  site: 'https://mzrfo.com.br',
  output: 'static',
  integrations: [
    sanity({
      projectId: 'xe11jg20',
      dataset: 'production',
      useCdn: true,
    }),
  ],
});
