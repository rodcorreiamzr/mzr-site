// Migrador Webflow CSV -> Sanity (publicacao). Genérico por categoria.
//
// Uso:
//   TOKEN=$(npx sanity debug --secrets | grep 'Auth token' | awk '{print $3}')
//   SANITY_TOKEN=$TOKEN node scripts/migrar.mjs --csv "/caminho/x.csv" --category cartas --dry
//   SANITY_TOKEN=$TOKEN node scripts/migrar.mjs --csv "/caminho/x.csv" --category cartas --publish
//
// Flags: --dry (só preview+diagnóstico, não grava) | --publish (grava)
//        --force (regrava itens já existentes)   --keep-first-heading (não remove o 1º título do corpo)
//        --body-col / --date-col / --name-col / --tag / --id-prefix / --strip-prefix (overrides)
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { createClient } from '@sanity/client';
import { htmlToPortableText, slugify } from './lib/convert.mjs';

const args = process.argv.slice(2);
const has = (n) => args.includes('--' + n);
const opt = (n, def) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };

const CSV = opt('csv');
const CATEGORY = opt('category');
const DRY = has('dry');
const PUBLISH = has('publish');
const FORCE = has('force');

const PRESETS = {
  // stripFirstHeading: livros repetem o título como 1º heading (remover); cartas
  // começam com uma seção real (RESUMO DO TIME...) que NÃO deve ser removida.
  livros:   { tag: 'Livros',         idPrefix: 'livro-',   stripPrefix: /^\s*livro:\s*/i,               stripFirstHeading: true },
  cartas:   { tag: 'Cartas Mensais', idPrefix: 'carta-',   stripPrefix: /^\s*carta[^:]*:\s*/i,           stripFirstHeading: false },
  analises: { tag: 'Analises',       idPrefix: 'analise-', stripPrefix: /^\s*an[aá]lises?[^:]*:\s*/i,    stripFirstHeading: true },
  gestoras: { tag: 'Gestoras',       idPrefix: 'gestora-', stripPrefix: /^$/,                             stripFirstHeading: false },
  fofs:     { tag: 'FOFs',           idPrefix: 'fof-',     stripPrefix: /^$/,                             stripFirstHeading: true },
};

if (!CSV || !CATEGORY) { console.error('Faltou --csv e/ou --category (livros|cartas|analises|gestoras|fofs)'); process.exit(1); }
if (!DRY && !PUBLISH) { console.error('Escolha --dry (preview) ou --publish (grava).'); process.exit(1); }
const preset = PRESETS[CATEGORY];
if (!preset && !opt('tag')) { console.error(`Categoria "${CATEGORY}" desconhecida. Use --tag e --id-prefix manualmente.`); process.exit(1); }

const TAG = opt('tag', preset?.tag);
const ID_PREFIX = opt('id-prefix', preset?.idPrefix);
const stripPrefix = opt('strip-prefix') ? new RegExp(opt('strip-prefix'), 'i') : (preset?.stripPrefix || /^$/);
const NAME_COL = opt('name-col', 'Name');
const BODY_COL = opt('body-col', 'Post Body');
const DATE_COL = opt('date-col', 'Data');
const IMG_WIDTH = opt('img-width') ? Number(opt('img-width')) : undefined; // largura % em todas as imagens do lote
// remove o 1º heading (título repetido): default do preset, com override por flag
const STRIP_HEADING = has('strip-first-heading') ? true : has('keep-first-heading') ? false : (preset?.stripFirstHeading ?? true);

const token = process.env.SANITY_TOKEN;
if (!token) { console.error('Faltou SANITY_TOKEN'); process.exit(1); }
const client = createClient({ projectId: 'xe11jg20', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false });

// ---- upload de imagem (dedup por hash já é nativo do Sanity) ----
const assetCache = new Map();
async function uploadImageReal(url) {
  if (assetCache.has(url)) return assetCache.get(url);
  // src inacessível (blob:/data:/relativo do Webflow) ou fetch falho: não aborta
  // o lote — ignora a imagem (retorna null) e segue. O conversor pula o bloco.
  if (!/^https?:\/\//i.test(url)) {
    console.warn(`⚠ imagem ignorada (src não-http): ${url.slice(0, 80)}`);
    assetCache.set(url, null); return null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
    const asset = await client.assets.upload('image', buf, { filename });
    assetCache.set(url, asset._id);
    return asset._id;
  } catch (e) {
    console.warn(`⚠ imagem ignorada (${e.message}): ${url.slice(0, 80)}`);
    assetCache.set(url, null); return null;
  }
}
const uploadImage = DRY ? async () => null : uploadImageReal;

// ---- upload de PDF linkado (ex.: lâminas/cartas do FoF) -> asset "file",
// href reescrito pro CDN da Sanity (dedup por hash já é nativo do Sanity) ----
const assetCachePdf = new Map();
async function uploadPdfReal(url) {
  if (assetCachePdf.has(url)) return assetCachePdf.get(url);
  if (!/^https?:\/\//i.test(url)) {
    console.warn(`⚠ pdf ignorado (href não-http): ${url.slice(0, 80)}`);
    assetCachePdf.set(url, null); return null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const filename = decodeURIComponent(url.split('/').pop().split('?')[0]);
    const asset = await client.assets.upload('file', buf, { filename });
    assetCachePdf.set(url, asset.url);
    return asset.url;
  } catch (e) {
    console.warn(`⚠ pdf não migrado (${e.message}): ${url.slice(0, 80)}`);
    assetCachePdf.set(url, null); return null;
  }
}
const uploadPdf = DRY ? async () => null : uploadPdfReal;

// ---- data ----
function toISODate(row) {
  for (const col of [DATE_COL, 'Published On', 'Created On']) {
    const v = row[col];
    if (!v) continue;
    const d = new Date(v);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  return null;
}

// ---- carrega estado existente (slugs -> _id) para dedup e skip ----
const existingRows = await client.fetch(`*[_type=='publicacao']{ "s": slug.current, _id }`);
const existingSlugToId = new Map(existingRows.map(r => [r.s, r._id]));
const existingIds = new Set(existingRows.map(r => r._id));

const batchSlugs = new Set();
function uniqueSlug(base) {
  let s = base || 'sem-titulo', i = 2;
  while (true) {
    const id = ID_PREFIX + s;
    const owner = existingSlugToId.get(s);
    if ((!owner || owner === id) && !batchSlugs.has(s)) { batchSlugs.add(s); return s; }
    s = (base || 'sem-titulo') + '-' + (i++);
  }
}

// ---- parse CSV ----
const raw = fs.readFileSync(CSV, 'utf8');
const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
if (parsed.errors.length) console.warn('⚠ Papa erros:', parsed.errors.slice(0, 3));
const rows = parsed.data;

// ---- converte ----
const docs = [];
const warnings = [];
const globalTags = {};
const flaggedDocs = [];

for (const row of rows) {
  const name = (row[NAME_COL] || '').trim();
  if (!name) { warnings.push('linha sem Name — pulada'); continue; }
  const titulo = name.replace(stripPrefix, '').replace(/\s+/g, ' ').trim();
  const slug = uniqueSlug(slugify(titulo));
  const _id = ID_PREFIX + slug;
  const data = toISODate(row);
  if (!data) warnings.push(`${_id}: sem data válida`);

  const diag = { tags: {}, images: 0, links: 0, flags: new Set(), strippedHeading: null };
  const body = row[BODY_COL] || '';
  if (!body.trim()) warnings.push(`${_id}: corpo vazio`);
  const corpo = await htmlToPortableText(body, { uploadImage, uploadPdf, stripFirstHeading: STRIP_HEADING, diag, imgWidth: IMG_WIDTH, dry: DRY });

  for (const [t, c] of Object.entries(diag.tags)) globalTags[t] = (globalTags[t] || 0) + c;
  if (diag.flags.size) flaggedDocs.push({ _id, flags: [...diag.flags] });

  docs.push({
    doc: { _id, _type: 'publicacao', titulo, slug: { _type: 'slug', current: slug }, tag: TAG, data, corpo },
    diag, exists: existingIds.has(_id),
  });
}

// ---- relatório ----
const line = (s) => console.log(s);
line(`\n=== ${CATEGORY} · tag "${TAG}" · ${docs.length} itens ===`);
for (const { doc, diag, exists } of docs) {
  const imgs = doc.corpo.filter(b => b._type === 'image').length;
  const fl = diag.flags.size ? ' ⚠' + [...diag.flags].join(',') : '';
  line(`${exists ? '~' : '+'} ${doc.slug.current}  [${doc.data || 'SEM DATA'}]  blocos=${doc.corpo.length} img=${imgs} links=${diag.links}${fl}`);
}
line(`\ntags no HTML: ${Object.entries(globalTags).sort((a,b)=>b[1]-a[1]).map(([t,c])=>`${t}:${c}`).join('  ')}`);
if (flaggedDocs.length) {
  line(`\n⚠ ATENÇÃO — itens com iframe/table/script (revisar render):`);
  for (const f of flaggedDocs) line(`   ${f._id}: ${f.flags.join(', ')}`);
}
if (warnings.length) { line(`\n⚠ avisos (${warnings.length}):`); warnings.slice(0, 30).forEach(w => line('   ' + w)); }

// ---- saída ----
if (DRY) {
  const outBase = CSV.replace(/\.csv$/i, '');
  const previewDocs = docs.map(d => d.doc);
  fs.writeFileSync(outBase + '.preview.json', JSON.stringify(previewDocs, null, 2));
  // amostra legível do 1º item
  const sample = docs[0];
  if (sample) {
    const txt = ['TÍTULO: ' + sample.doc.titulo, 'SLUG: ' + sample.doc.slug.current, 'HEADING REMOVIDO: ' + (sample.diag.strippedHeading || '(nenhum)'), ''];
    for (const b of sample.doc.corpo) {
      if (b._type === 'image') txt.push('[IMAGE ' + (b._pendingSrc || b.asset?._ref) + ']');
      else if (b._type === 'codigoEmbutido') txt.push('[EMBED] ' + b.codigo.slice(0, 120));
      else txt.push(`[${b.style}${b.listItem ? '/'+b.listItem : ''}] ` + b.children.map(c => c.text).join(''));
    }
    fs.writeFileSync(outBase + '.amostra.txt', txt.join('\n'));
  }
  line(`\n[DRY] nada gravado. Preview: ${path.basename(outBase)}.preview.json + .amostra.txt`);
  process.exit(0);
}

// ---- publish ----
const toWrite = docs.filter(d => FORCE || !d.exists);
const skipped = docs.length - toWrite.length;
if (!toWrite.length) { line(`\nNada a gravar (todos já existem; use --force para regravar).`); process.exit(0); }
const tx = client.transaction();
for (const d of toWrite) tx.createOrReplace(d.doc);
await tx.commit();
line(`\n✅ Publicados ${toWrite.length} itens${skipped ? ` (${skipped} já existiam, pulados)` : ''} em 1 transação.`);
