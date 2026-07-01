import { defineField, defineType } from 'sanity';

// Item da lista do modal "Regulatório - Downloads" do footer.
// Aceita upload de PDF OU uma URL externa. Ao subir um novo PDF no mesmo item,
// o anterior é substituído (sem versionamento). Mesmo padrão do documentoLink dos fundos.
const documentoRegulatorio = {
  type: 'object',
  name: 'documentoRegulatorio',
  title: 'Documento',
  fields: [
    {
      name: 'label',
      title: 'Texto do link',
      type: 'string',
      description: 'Ex: "Política de Controles Internos", "Formulário de Referência".',
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

// Documento SINGLETON — manter apenas 1 registro (id publicado "documentosRegulatorio").
// Alimenta o modal "Regulatório - Downloads" do footer, na ordem definida aqui.
export const documentosRegulatorio = defineType({
  name: 'documentosRegulatorio',
  title: 'Documentos — Regulatório',
  type: 'document',
  description: 'Códigos, políticas e Formulário de Referência exibidos no modal "Regulatório - Downloads" do rodapé. Mantenha apenas UM registro.',
  fields: [
    defineField({
      name: 'documentos',
      title: 'Documentos',
      type: 'array',
      of: [documentoRegulatorio],
      description: 'Lista de documentos do modal, na ordem em que aparecem. Reordene arrastando. Para atualizar um documento, troque o PDF no mesmo item.',
    }),
  ],
  preview: {
    select: { docs: 'documentos' },
    prepare({ docs }: { docs?: any[] }) {
      const n = docs?.length || 0;
      return { title: 'Documentos — Regulatório', subtitle: `${n} documento${n === 1 ? '' : 's'}` };
    },
  },
});
