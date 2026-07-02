import { defineField, defineType } from 'sanity';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Bloco de lâmina mensal de um fundo. NÃO acumula: o upload de um novo PDF
// substitui a lâmina anterior. O título exibido na página é montado
// automaticamente como "{Nome do fundo} — Lâmina {Mês}/{Ano}" (ver lib/sanity.ts).
const laminaMensal = (name: string, title: string, nomeExibicao: string) =>
  defineField({
    name,
    title,
    type: 'object',
    options: { collapsible: false },
    fields: [
      defineField({
        name: 'mes',
        title: 'Mês',
        type: 'string',
        options: { list: MESES.map((m) => ({ title: m, value: m })), layout: 'dropdown' },
      }),
      defineField({
        name: 'ano',
        title: 'Ano',
        type: 'string',
        description: 'Ex.: 2026',
      }),
      defineField({
        name: 'arquivo',
        title: 'PDF da lâmina (atual)',
        type: 'file',
        options: { accept: '.pdf' },
        description: 'Suba a lâmina do mês. Para trocar, substitua o arquivo aqui — o anterior é descartado (não acumula histórico).',
      }),
    ],
    preview: {
      select: { mes: 'mes', ano: 'ano', file: 'arquivo.asset.originalFilename' },
      prepare({ mes, ano, file }: { mes?: string; ano?: string; file?: string }) {
        const periodo = mes && ano ? `${mes}/${ano}` : 'sem mês/ano';
        return {
          title: `${nomeExibicao} — Lâmina ${periodo}`,
          subtitle: file || '⚠ Nenhum PDF enviado',
        };
      },
    },
  });

// Item da lista de Fatos Relevantes do PE/VC — este bloco ACUMULA.
const fatoRelevante = {
  type: 'object',
  name: 'fatoRelevante',
  title: 'Fato Relevante',
  fields: [
    {
      name: 'titulo',
      title: 'Título',
      type: 'string',
      description: 'Texto do link exibido na página. Ex.: "01 de Setembro de 2025".',
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: 'arquivo',
      title: 'PDF',
      type: 'file',
      options: { accept: '.pdf' },
    },
  ],
  preview: {
    select: { title: 'titulo', file: 'arquivo.asset.originalFilename' },
    prepare({ title, file }: { title?: string; file?: string }) {
      return { title: title || 'Fato Relevante', subtitle: file || '⚠ Sem PDF' };
    },
  },
};

export const fundoDocumentos = defineType({
  name: 'fundoDocumentos',
  title: 'Documentos de Fundos',
  type: 'document',
  description: 'Lâminas mensais de cada fundo (uma por fundo — o upload substitui a anterior) e a lista acumulada de Fatos Relevantes do PE/VC. Estrutura fixa: um único registro.',
  fields: [
    laminaMensal('allocation', 'Allocation', 'Allocation'),
    laminaMensal('globalEquities', 'Global Equities', 'Global Equities'),
    laminaMensal('cicloOlimpico', 'Ciclo Olímpico', 'Ciclo Olímpico'),
    defineField({
      name: 'fatosRelevantesPevc',
      title: 'Fatos Relevantes — PE/VC',
      type: 'array',
      of: [fatoRelevante],
      description: 'Único bloco que ACUMULA. Adicione um item por fato relevante (PDF + Título); os anteriores permanecem. Cada item vira um link na sub-tela de Fatos Relevantes do PE/VC. Use os botões para editar ou remover um item.',
    }),
  ],
  preview: {
    prepare() {
      return { title: 'Documentos de Fundos' };
    },
  },
});
