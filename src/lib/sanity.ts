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
      corpo,
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
