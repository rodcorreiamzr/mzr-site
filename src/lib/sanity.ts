import { createClient } from '@sanity/client';

const client = createClient({
  projectId: 'xe11jg20',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true,
});

export async function getPublicacoes() {
  return client.fetch(`
    *[_type == "publicacao"] | order(data desc) {
      _id,
      titulo,
      "slug": slug.current,
      tag,

      data,
      "ogImagemUrl": ogImagem.asset->url
    }
  `);
}

export async function getPublicacaoBySlug(slug: string) {
  return client.fetch(`
    *[_type == "publicacao" && slug.current == $slug][0] {
      _id,
      titulo,
      "slug": slug.current,
      tag,

      data,
      corpo[] {
        ...,
        "assetUrl": asset->url
      },
      "ogImagemUrl": ogImagem.asset->url
    }
  `, { slug });
}

export async function getUltimasPublicacoes(limit: number = 3) {
  return client.fetch(`
    *[_type == "publicacao"] | order(data desc) [0...$limit] {
      _id,
      titulo,
      "slug": slug.current,
      tag,

      data,
      "ogImagemUrl": ogImagem.asset->url
    }
  `, { limit });
}

// Documentos de fundos (lâminas, prestação de contas, fatos relevantes) por fundoId.
// Só inclui itens com PDF anexado OU URL externa. Retorna mapa { fundoId: { documentos, fatosRelevantes } }.
export async function getFundoDocumentos() {
  const docs = await client.fetch(`
    *[_type == "fundoDocumentos"]{
      fundoId,
      "documentos": documentos[defined(arquivo) || defined(urlExterna)]{
        label,
        "url": coalesce(arquivo.asset->url, urlExterna)
      },
      "fatosRelevantes": fatosRelevantes[defined(arquivo) || defined(urlExterna)]{
        label,
        "url": coalesce(arquivo.asset->url, urlExterna)
      }
    }
  `);
  const mapa: Record<string, { documentos: any[]; fatosRelevantes: any[] }> = {};
  for (const d of docs || []) {
    if (!d?.fundoId) continue;
    mapa[d.fundoId] = {
      documentos: d.documentos || [],
      fatosRelevantes: d.fatosRelevantes || [],
    };
  }
  return mapa;
}
