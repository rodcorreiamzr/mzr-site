// Verifica, contra o site NO AR, tudo que foi feito para agentes de IA — as
// mesmas checagens do Is Agentic (isagentic.com), mais robots/sitemap.
//
// Uso:
//   npm run check:agentes                      # https://mzrfo.com.br
//   node scripts/check-agentes.mjs <baseUrl>   # outro deploy
//
// Sai com código 1 se algo falhar. Só faz GET/HEAD; não envia formulário.
const BASE = (process.argv[2] || 'https://mzrfo.com.br').replace(/\/$/, '');
const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

let falhas = 0;
function check(nome, ok, detalhe = '') {
  console.log((ok ? '✔ ' : '✘ ') + nome + (ok || !detalhe ? '' : '  → ' + detalhe));
  if (!ok) falhas++;
}

async function get(caminho, accept, extra = {}) {
  const res = await fetch(BASE + caminho, { headers: { accept }, redirect: 'manual', ...extra });
  const body = extra.method === 'HEAD' ? '' : await res.text();
  return { status: res.status, type: res.headers.get('content-type') || '', vary: res.headers.get('vary') || '', location: res.headers.get('location'), body };
}

function jsonLd(html) {
  const blocos = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocos.map((m) => JSON.parse(m[1]));
}

// Home — HTML com JSON-LD
const homeHtml = await get('/', HTML);
check('Home HTML: 200 text/html', homeHtml.status === 200 && homeHtml.type.includes('text/html'), homeHtml.status + ' ' + homeHtml.type);
check('Home HTML: Vary inclui Accept', /accept/i.test(homeHtml.vary), 'Vary: ' + homeHtml.vary);
let ld = [];
try { ld = jsonLd(homeHtml.body); } catch (e) { check('Home JSON-LD: JSON válido', false, e.message); }
const org = ld.flatMap((d) => d['@graph'] || [d]).find((n) => n['@type'] === 'FinancialService');
check('Home JSON-LD: FinancialService com name/url/description', !!(org && org.name && org.url && org.description));
check('Home: <link rel=alternate type=text/markdown>', /<link rel="alternate" type="text\/markdown" href="\/index\.md"/.test(homeHtml.body));

// Home — Markdown
const homeMd = await get('/', 'text/markdown');
check('Home Markdown: 200 text/markdown', homeMd.status === 200 && homeMd.type.startsWith('text/markdown'), homeMd.status + ' ' + homeMd.type);
check('Home Markdown: Vary inclui Accept', /accept/i.test(homeMd.vary), 'Vary: ' + homeMd.vary);
check('Home Markdown: começa com "# " e não é HTML', homeMd.body.startsWith('# ') && !/<html/i.test(homeMd.body));

// Publicação — pega a mais recente da lista em Markdown
const lista = await get('/publicacoes', 'text/markdown');
check('Publicações Markdown: 200 text/markdown', lista.status === 200 && lista.type.startsWith('text/markdown'), lista.status + ' ' + lista.type);
const slug = (lista.body.match(/\/publicacoes\/([^)\s]+)\.md\)/) || [])[1];
check('Publicações Markdown: lista links .md', !!slug);
if (slug) {
  const pubMd = await get('/publicacoes/' + slug, 'text/markdown');
  check('Publicação Markdown (' + slug + '): 200 text/markdown', pubMd.status === 200 && pubMd.type.startsWith('text/markdown') && pubMd.body.startsWith('# '), pubMd.status + ' ' + pubMd.type);
  const pubHtml = await get('/publicacoes/' + slug, HTML);
  const art = (() => { try { return jsonLd(pubHtml.body).find((d) => d['@type'] === 'Article'); } catch { return null; } })();
  check('Publicação HTML: JSON-LD Article', pubHtml.status === 200 && !!art?.headline);
  const direto = await get('/publicacoes/' + slug + '.md', '*/*');
  check('Publicação .md direto: 200 text/markdown', direto.status === 200 && direto.type.startsWith('text/markdown'), direto.status + ' ' + direto.type);
}

// Página sem versão .md → continua HTML mesmo pedindo Markdown
const pc = await get('/prestacao-de-contas', 'text/markdown', { method: 'HEAD' });
check('Página sem .md (prestação de contas): cai no HTML 200', pc.status === 200 && pc.type.includes('text/html'), pc.status + ' ' + pc.type);

// 404
const sonda = '/__sonda-404-' + Date.now();
const nfHtml = await get(sonda, HTML);
check('404 HTML: status 404 + página da MZR', nfHtml.status === 404 && nfHtml.type.includes('text/html') && nfHtml.body.includes('Página não encontrada'), nfHtml.status + ' ' + nfHtml.type);
const nfMd = await get(sonda, 'text/markdown');
check('404 Markdown: status 404 text/markdown', nfMd.status === 404 && nfMd.type.startsWith('text/markdown'), nfMd.status + ' ' + nfMd.type);
check('404 Markdown: corpo ≥ 20 caracteres com link para llms.txt', nfMd.body.length >= 20 && nfMd.body.includes('/llms.txt'));

// Redirects continuam HTTP 302, inclusive para agentes
for (const r of ['/instagram', '/linkedin', '/spotify', '/estagio']) {
  const res = await get(r, 'text/markdown', { method: 'HEAD' });
  check('Redirect ' + r + ': 302 com Location', res.status === 302 && !!res.location, res.status + ' ' + res.location);
}

// Arquivos para robôs
const llms = await get('/llms.txt', '*/*');
check('llms.txt: 200 text/plain', llms.status === 200 && llms.type.startsWith('text/plain'), llms.status + ' ' + llms.type);
check('llms.txt: H1 + resumo + seção "when to use"', /^# .+\n\n> /.test(llms.body) && /^## .*when to use/m.test(llms.body));
const robots = await get('/robots.txt', '*/*');
check('robots.txt: 200 com Sitemap', robots.status === 200 && /^Sitemap: https:\/\/mzrfo\.com\.br\/sitemap-index\.xml$/m.test(robots.body), robots.status + '');
const sitemap = await get('/sitemap-index.xml', '*/*');
check('sitemap-index.xml: 200', sitemap.status === 200 && sitemap.body.includes('<sitemapindex'), sitemap.status + '');
const sm0 = await get('/sitemap-0.xml', '*/*');
check('sitemap: sem página noindex e sem .md', sm0.status === 200 && !sm0.body.includes('carta-anual-alternativos') && !sm0.body.includes('.md<'));

console.log(falhas ? '\n' + falhas + ' falha(s) em ' + BASE : '\nTudo certo em ' + BASE);
process.exit(falhas ? 1 : 0);
