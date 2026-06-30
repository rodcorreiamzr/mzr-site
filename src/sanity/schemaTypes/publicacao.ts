import { defineField, defineType } from 'sanity';

export const publicacao = defineType({
  name: 'publicacao',
  title: 'Publicação',
  type: 'document',
  fields: [
    defineField({
      name: 'titulo',
      title: 'Título',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL)',
      type: 'slug',
      options: { source: 'titulo' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tag',
      title: 'Categoria',
      type: 'string',
      options: {
        list: [
          { title: 'Cartas Mensais', value: 'Cartas Mensais' },
          { title: 'Análises', value: 'Analises' },
          { title: 'Livros', value: 'Livros' },
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'data',
      title: 'Data de publicação',
      type: 'date',
      options: { dateFormat: 'DD/MM/YYYY' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'ogImagem',
      title: 'Imagem para compartilhamento (Open Graph)',
      type: 'image',
      description: 'Aparece no preview ao compartilhar no WhatsApp, LinkedIn, etc. Tamanho ideal: 1200 × 630px.',
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
            { title: 'Texto regulatório', value: 'regulatorio' },
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
                  {
                    name: 'href',
                    type: 'url',
                    title: 'URL',
                  },
                  {
                    name: 'blank',
                    type: 'boolean',
                    title: 'Abrir em nova aba',
                    initialValue: true,
                  },
                ],
              },
            ],
          },
        },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            {
              name: 'legenda',
              title: 'Legenda da imagem',
              type: 'string',
            },
          ],
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
              return {
                title: '⌨ Código embutido',
                subtitle: title?.slice(0, 80),
              };
            },
          },
        },
      ],
    }),
    defineField({
      name: 'arquivoPdf',
      title: 'Arquivo PDF (opcional)',
      type: 'file',
      options: { accept: '.pdf' },
    }),
  ],
  orderings: [
    {
      title: 'Data (mais recente)',
      name: 'dataDesc',
      by: [{ field: 'data', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'titulo', subtitle: 'tag', media: 'ogImagem' },
  },
});
