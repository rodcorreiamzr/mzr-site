import { defineField, defineType } from 'sanity';

// Objeto reutilizável: um link de documento (lâmina, prestação de contas, fato relevante).
// Aceita upload de PDF OU uma URL externa. Ao subir um novo PDF no mesmo item,
// o anterior é simplesmente substituído (sem versionamento).
const documentoLink = {
  type: 'object',
  name: 'documentoLink',
  title: 'Documento',
  fields: [
    {
      name: 'label',
      title: 'Texto do link',
      type: 'string',
      description: 'Ex: "Allocation — Lâmina Maio/26", "Prestação de Contas".',
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: 'arquivo',
      title: 'Arquivo PDF',
      type: 'file',
      options: { accept: '.pdf' },
      description: 'Suba o PDF aqui. Para atualizar, basta substituir o arquivo — o anterior é descartado.',
    },
    {
      name: 'urlExterna',
      title: 'URL externa (opcional)',
      type: 'url',
      description: 'Use apenas se o documento estiver hospedado fora do Sanity. Se houver PDF acima, ele tem prioridade.',
    },
  ],
  preview: {
    select: { title: 'label', file: 'arquivo.asset.originalFilename', url: 'urlExterna' },
    prepare({ title, file, url }: { title: string; file?: string; url?: string }) {
      return { title: title || 'Documento', subtitle: file || url || '⚠ Sem arquivo nem URL' };
    },
  },
};

export const fundoDocumentos = defineType({
  name: 'fundoDocumentos',
  title: 'Documentos de Fundos',
  type: 'document',
  description: 'Lâminas e documentos exibidos no modal de cada fundo da home. Crie um registro por fundo.',
  fields: [
    defineField({
      name: 'fundoId',
      title: 'Fundo',
      type: 'string',
      options: {
        list: [
          { title: 'Multimercado — Allocation Retorno Absoluto', value: 'multimercado' },
          { title: 'RV Internacional — Allocation Global Equities', value: 'globalequities' },
          { title: 'RV Local — Ciclo Olímpico', value: 'cicloolimpico' },
          { title: 'Alternativos — Allocation PE/VC', value: 'pevc' },
        ],
        layout: 'radio',
      },
      description: 'Selecione o fundo. Crie apenas um registro por fundo.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'documentos',
      title: 'Lâminas / Documentos',
      type: 'array',
      of: [documentoLink],
      description: 'Documentos da tela principal do modal (lâminas, prestação de contas, etc.).',
    }),
    defineField({
      name: 'fatosRelevantes',
      title: 'Fatos Relevantes (somente PE/VC)',
      type: 'array',
      of: [documentoLink],
      description: 'Usado apenas no fundo PE/VC — aparece na sub-tela "Fatos Relevantes". Ignorado nos demais fundos.',
    }),
  ],
  preview: {
    select: { fundoId: 'fundoId' },
    prepare({ fundoId }: { fundoId: string }) {
      const nomes: Record<string, string> = {
        multimercado: 'Multimercado — Allocation Retorno Absoluto',
        globalequities: 'RV Internacional — Allocation Global Equities',
        cicloolimpico: 'RV Local — Ciclo Olímpico',
        pevc: 'Alternativos — Allocation PE/VC',
      };
      return { title: nomes[fundoId] || 'Documentos de Fundo', subtitle: 'Documentos de Fundos' };
    },
  },
});
