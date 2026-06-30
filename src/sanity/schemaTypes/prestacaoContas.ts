import { defineField, defineType } from 'sanity';

// Linha da tabela de prestação de contas — um período com seus valores + a nota fiscal (PDF).
const linhaPrestacao = {
  type: 'object',
  name: 'linhaPrestacao',
  title: 'Linha (Período)',
  fields: [
    {
      name: 'periodo',
      title: 'Período',
      type: 'string',
      description: 'Ex: "Jul - Dez 22", "1T 2023".',
      validation: (Rule: any) => Rule.required(),
    },
    { name: 'faturamentoTotal', title: 'Faturamento Total', type: 'string', description: 'Cole o valor formatado, ex: "R$ 39.720,27".' },
    { name: 'despesasOperacionais', title: 'Despesas Operacionais', type: 'string', description: 'Ex: "R$ 4.672,99". Use ** ou * se houver nota de rodapé.' },
    { name: 'faturamentoAntesIR', title: 'Faturamento antes do IR', type: 'string' },
    { name: 'valorInvestimentoEsporte', title: 'Valor de Investimento no Esporte', type: 'string' },
    {
      name: 'notaFiscal',
      title: 'Comprovante (Nota Fiscal) — PDF',
      type: 'file',
      options: { accept: '.pdf' },
      description: 'Suba o PDF da nota fiscal deste período. Vira o botão "Download" na linha.',
    },
  ],
  preview: {
    select: { title: 'periodo', subtitle: 'faturamentoTotal' },
    prepare({ title, subtitle }: { title: string; subtitle?: string }) {
      return { title: title || 'Período', subtitle: subtitle || '' };
    },
  },
};

// Prestação de Contas do Ciclo Olímpico — PÁGINA ÚNICA (não coleção).
// Conteúdo rico (título, fotos, texto) + a tabela estruturada por período.
// Manter apenas UM registro deste tipo.
export const prestacaoContas = defineType({
  name: 'prestacaoContas',
  title: 'Prestação de Contas (Ciclo Olímpico)',
  type: 'document',
  fields: [
    defineField({
      name: 'titulo',
      title: 'Título',
      type: 'string',
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
      title: 'Conteúdo (texto e fotos)',
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
          fields: [{ name: 'codigo', title: 'Código', type: 'text', rows: 6, description: 'Cole aqui HTML, iframe, gráfico, etc.' }],
          preview: {
            select: { title: 'codigo' },
            prepare({ title }: { title: string }) {
              return { title: '⌨ Código embutido', subtitle: title?.slice(0, 80) };
            },
          },
        },
      ],
    }),
    defineField({
      name: 'tabela',
      title: 'Tabela de Prestação de Contas',
      type: 'array',
      of: [linhaPrestacao],
      description: 'Uma linha por período. No mobile vira acordeão (toca pra expandir).',
    }),
    defineField({
      name: 'notaRodape',
      title: 'Nota de rodapé da tabela',
      type: 'text',
      rows: 2,
      description: 'Texto explicativo dos asteriscos (* e **) exibido abaixo da tabela.',
    }),
  ],
  preview: {
    select: { title: 'titulo', media: 'ogImagem' },
    prepare({ title, media }: { title: string; media?: any }) {
      return { title: title || 'Prestação de Contas', subtitle: 'Ciclo Olímpico', media };
    },
  },
});
