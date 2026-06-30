import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { publicacao } from './src/sanity/schemaTypes/publicacao';

export default defineConfig({
  projectId: 'xe11jg20',
  dataset: 'production',
  title: 'MZR Family Office',
  plugins: [structureTool()],
  schema: {
    types: [publicacao],
  },
});
