import { defineField, defineType } from 'sanity';

// Prestação de Contas do Ciclo Olímpico — página dedicada com conteúdo rico.
// Coleção: um registro por período (ex: 2025, 1º Semestre 2026...). O modal do
// fundo Ciclo Olímpico linka automaticamente para a prestação mais recente.
export const prestacaoContas = defineType({
  name: 'prestacaoContas',
  title: 'Prestação de Contas (Ciclo Olímpico)',
  type: 'document',
  fields: [
    defineField({
      name: 'titulo',
      title: 'Título',
      type: 'string',
      description: 'Ex: "Prestação de Contas 2025".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'periodo',
      title: 'Período',
      type: 'string',
      description: 'Rótulo curto exibido acima do título (ex: "2025", "1º Semestre 2026"). Opcional.',
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL)',
      type: 'slug',
      options: { source: 'titulo' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'data',
      title: 'Data',
      type: 'date',
      options: { dateFormat: 'DD/MM/YYYY' },
      description: 'Usada para ordenar — a mais recente é a que o modal do fundo exibe.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'ogImagem',
      title: 'Imagem para compartilhamento (Open Graph)',
      type: 'image',
      description: 'Aparece no preview ao compartilhar (WhatsApp, LinkedIn). Ideal 1200 × 630px.',
      options: { hotspot: true },
    }),
    defineField({
      name: 'corpo',
      title: 'Conteúdo',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            { title: 'Normal', value: 'normal' },
            { title: 'Título H2', value: 'h2' },
            { title: 'Título H3', value: 'h3' },
            { title: 'Legenda', value: 'legenda' },
            { title: 'Citação', value: 'blockquote' },
          ],
          marks: {
            decorators: [
              { title: 'Negrito', value: 'strong' },
              { title: 'Itálico', value: 'em' },
            ],
            annotations: [
              {
                name: 'link',
                type: 'object',
                title: 'Link',
                fields: [
                  { name: 'href', type: 'url', title: 'URL' },
                  { name: 'blank', type: 'boolean', title: 'Abrir em nova aba', initialValue: true },
                ],
              },
            ],
          },
        },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [{ name: 'legenda', title: 'Legenda da imagem', type: 'string' }],
        },
        {
          type: 'object',
          name: 'codigoEmbutido',
          title: 'Código / HTML embutido',
          fields: [
            {
              name: 'codigo',
              title: 'Código',
              type: 'text',
              rows: 6,
              description: 'Cole aqui HTML, iframe, script de gráfico, etc.',
            },
          ],
          preview: {
            select: { title: 'codigo' },
            prepare({ title }: { title: string }) {
              return { title: '⌨ Código embutido', subtitle: title?.slice(0, 80) };
            },
          },
        },
      ],
    }),
  ],
  orderings: [
    { title: 'Data (mais recente)', name: 'dataDesc', by: [{ field: 'data', direction: 'desc' }] },
  ],
  preview: {
    select: { title: 'titulo', subtitle: 'periodo', media: 'ogImagem' },
  },
});
