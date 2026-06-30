import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './src/sanity/schemaTypes';

export default defineConfig({
  projectId: 'xe11jg20',
  dataset: 'production',
  title: 'MZR Family Office',
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
});
