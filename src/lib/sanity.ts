import { createClient } from '@sanity/client';

const client = createClient({
  projectId: 'xe11jg20',
  dataset: 'production',
  apiVersion: '2024-01-01',
  // false: fetches são só em build-time (SSG). Garante dados frescos e evita a
  // defasagem do CDN logo após publicar (build pegava conteúdo antigo).
  useCdn: false,
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

// Documentos de fundos — registro único com blocos fixos por fundo:
// cada fundo "regular" tem UMA lâmina mensal (mes/ano/PDF, substituída a cada mês)
// e o PE/VC tem a lista acumulada de Fatos Relevantes.
// Retorna o mesmo mapa { fundoId: { documentos, fatosRelevantes } } que o front-end
// (index.astro) consome: o label da lâmina é montado como "{Nome} — Lâmina {Mês}/{Ano}".
export async function getFundoDocumentos() {
  const doc = await client.fetch(`
    *[_type == "fundoDocumentos"][0]{
      allocation{ mes, ano, "url": arquivo.asset->url },
      globalEquities{ mes, ano, "url": arquivo.asset->url },
      cicloOlimpico{ mes, ano, "url": arquivo.asset->url },
      "fatosRelevantesPevc": fatosRelevantesPevc[defined(arquivo)]{
        titulo,
        "url": arquivo.asset->url
      }
    }
  `);

  const mapa: Record<string, { documentos: any[]; fatosRelevantes: any[] }> = {};
  if (!doc) return mapa;

  // Monta a lâmina única de um fundo regular, se houver PDF enviado.
  function lamina(bloco: any, nome: string): any[] {
    if (!bloco?.url) return [];
    const periodo = bloco.mes && bloco.ano ? `${bloco.mes}/${bloco.ano}` : '';
    const label = periodo ? `${nome} — Lâmina ${periodo}` : `${nome} — Lâmina`;
    return [{ label, url: bloco.url }];
  }

  const allocation = lamina(doc.allocation, 'Allocation');
  if (allocation.length) mapa.multimercado = { documentos: allocation, fatosRelevantes: [] };

  const globalEquities = lamina(doc.globalEquities, 'Global Equities');
  if (globalEquities.length) mapa.globalequities = { documentos: globalEquities, fatosRelevantes: [] };

  const cicloOlimpico = lamina(doc.cicloOlimpico, 'Ciclo Olímpico');
  if (cicloOlimpico.length) mapa.cicloolimpico = { documentos: cicloOlimpico, fatosRelevantes: [] };

  const fatos = (doc.fatosRelevantesPevc || [])
    .filter((f: any) => f?.titulo && f?.url)
    .map((f: any) => ({ label: f.titulo, url: f.url }));
  if (fatos.length) mapa.pevc = { documentos: [], fatosRelevantes: fatos };

  return mapa;
}

// Prestação de Contas do Ciclo Olímpico — PÁGINA ÚNICA. Retorna o registro
// (ou null), com a tabela e as URLs das notas fiscais (PDFs) resolvidas.
export async function getPrestacaoContas() {
  return client.fetch(`
    *[_type == "prestacaoContas"][0] {
      titulo,
      notaRodape,
      "ogImagemUrl": ogImagem.asset->url,
      corpo[] {
        ...,
        "assetUrl": asset->url
      },
      tabela[] {
        periodo,
        faturamentoTotal,
        despesasOperacionais,
        faturamentoAntesIR,
        valorInvestimentoEsporte,
        "notaFiscalUrl": notaFiscal.asset->url
      }
    }
  `);
}

// Documentos do modal "Regulatório - Downloads" do rodapé (singleton).
// Retorna TODOS os itens do registro (não filtra por PDF): itens sem arquivo nem
// URL vêm com url=null e o Base.astro renderiza href="#" — assim os links já
// existentes permanecem visíveis enquanto os PDFs são subidos aos poucos.
// Retorna [] só se não houver registro publicado — aí o Base.astro usa o fallback.
export async function getDocumentosRegulatorio() {
  const doc = await client.fetch(`
    *[_type == "documentosRegulatorio"][0] {
      "documentos": documentos[]{
        label,
        "url": coalesce(arquivo.asset->url, urlExterna)
      }
    }
  `);
  return doc?.documentos || [];
}
