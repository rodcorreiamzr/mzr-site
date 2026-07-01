import { defineConfig } from 'astro/config';
import sanity from '@sanity/astro';

export default defineConfig({
  site: 'https://mzr-site.vercel.app',
  output: 'static',
  integrations: [
    sanity({
      projectId: 'xe11jg20',
      dataset: 'production',
      useCdn: true,
    }),
  ],
});
