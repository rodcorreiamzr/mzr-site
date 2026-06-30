import { defineConfig } from 'astro/config';
import sanity from '@sanity/astro';

export default defineConfig({
  output: 'static',
  integrations: [
    sanity({
      projectId: 'xe11jg20',
      dataset: 'production',
      useCdn: true,
    }),
  ],
});
