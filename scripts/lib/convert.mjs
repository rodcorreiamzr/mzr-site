// Conversor HTML (rich text do Webflow) -> Portable Text (Sanity).
// Genérico para qualquer categoria. O upload de imagem é injetado (uploadImage),
// para o chamador controlar dry-run (sem gravar) vs publicação real.
import { JSDOM } from 'jsdom';

let n = 0;
export const key = () => 'k' + (n++).toString(36) + Math.random().toString(36).slice(2, 6);

// zero-width chars (inclui ‍ dos parágrafos vazios do Webflow) e nbsp -> espaço
const ZW = /[​‌‍⁠﻿]/g;
const cleanText = (s) => s.replace(ZW, '').replace(/ /g, ' ');
export const slugify = (t) => t.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '')
  .trim().replace(/\s+/g, '-');
const hasText = (children) => children.some(c => c._type === 'span' && c.text.replace(/\s/g, '').length > 0);
const norm = (s) => cleanText(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// link de PDF (ex.: Webflow uploads-ssl/*.pdf) -> reenvia como asset Sanity
// e reescreve o href pra apontar pro CDN da Sanity (o link do Webflow morre
// quando a conta for cancelada). Sem uploadPdf (ou dry-run) mantém o href original.
const isPdfHref = (href) => /\.pdf(\?|#|$)/i.test(href || '');

// Elemento -> {children:[spans], markDefs:[]} (processa inline: strong/em/a/br)
async function processInline(node, ctx) {
  const children = [], markDefs = [];
  async function walk(nd, marks) {
    for (const child of nd.childNodes) {
      if (child.nodeType === 3) {
        const text = cleanText(child.textContent);
        if (text) children.push({ _type: 'span', _key: key(), text, marks: [...marks] });
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'br') {
          children.push({ _type: 'span', _key: key(), text: '\n', marks: [...marks] });
        } else if (tag === 'strong' || tag === 'b') {
          await walk(child, [...marks, 'strong']);
        } else if (tag === 'em' || tag === 'i') {
          await walk(child, [...marks, 'em']);
        } else if (tag === 'a') {
          let href = child.getAttribute('href') || '';
          if (isPdfHref(href) && ctx?.uploadPdf) {
            ctx.diag.flags.add('pdf');
            ctx.diag.pdfLinks = (ctx.diag.pdfLinks || 0) + 1;
            const newUrl = await ctx.uploadPdf(href);
            if (newUrl) href = newUrl;
            else if (!ctx.dry) ctx.diag.flags.add('pdf-fail');
          }
          const mk = key();
          markDefs.push({ _key: mk, _type: 'link', href, blank: true });
          await walk(child, [...marks, mk]);
        } else {
          await walk(child, marks); // span/div/outros inline
        }
      }
    }
  }
  await walk(node, []);
  return { children, markDefs };
}

const block = (style, { children, markDefs }, extra = {}) =>
  ({ _type: 'block', _key: key(), style, markDefs, children, ...extra });

// Converte <ul>/<ol> em blocos de lista (Portable Text: listItem + level).
async function listBlocks(el, level, diag, ctx) {
  const out = [];
  const listItem = el.tagName.toLowerCase() === 'ol' ? 'number' : 'bullet';
  for (const li of el.children) {
    if (li.tagName.toLowerCase() !== 'li') continue;
    // separa sub-listas do conteúdo inline do <li>
    const sublists = [...li.children].filter(c => /^(UL|OL)$/.test(c.tagName));
    sublists.forEach(s => s.remove());
    const inline = await processInline(li, ctx);
    if (hasText(inline.children)) out.push(block('normal', inline, { listItem, level }));
    for (const s of sublists) { diag.tags.list = (diag.tags.list||0)+1; out.push(...await listBlocks(s, level + 1, diag, ctx)); }
  }
  return out;
}

/**
 * html -> array de blocos Portable Text.
 * opts: { uploadImage(url)->Promise<assetId|null>, uploadPdf(url)->Promise<url|null>, stripFirstHeading, diag }
 * diag acumula diagnóstico: { tags:{}, images, links, flags:Set }
 */
export async function htmlToPortableText(html, opts) {
  const { uploadImage, uploadPdf, stripFirstHeading = true, diag, imgWidth, dry = false } = opts;
  const ctx = { uploadPdf, diag, dry };
  const { window } = new JSDOM(html);
  const body = window.document.body;

  if (stripFirstHeading) {
    const first = [...body.children].find(el => /^H[1-6]$/.test(el.tagName));
    if (first) { diag.strippedHeading = cleanText(first.textContent).trim(); first.remove(); }
  }

  // Normaliza níveis: o heading mais raso presente vira H2 (gera o índice/TOC),
  // os demais viram H3. Ex.: cartas usam <h4> nas seções -> viram H2.
  const headingEls = [...body.children].filter(el => /^H[1-6]$/.test(el.tagName));
  const minLevel = headingEls.length ? Math.min(...headingEls.map(el => +el.tagName[1])) : 2;

  const blocks = [];
  for (const el of [...body.children]) {
    const tag = el.tagName.toLowerCase();
    diag.tags[tag] = (diag.tags[tag] || 0) + 1;

    // imagem (figure>img ou img solto)
    const img = tag === 'img' ? el : (tag === 'figure' ? el.querySelector('img') : null);
    const iframe = el.querySelector ? el.querySelector('iframe') : null;

    if (img && img.getAttribute('src')) {
      diag.images++;
      const src = img.getAttribute('src');
      const assetId = await uploadImage(src);
      if (!assetId && !dry) {
        // upload falhou (src blob:/data:/404 do Webflow) — pula o bloco em vez
        // de publicar uma imagem sem asset. Registra no diagnóstico.
        diag.skippedImages = (diag.skippedImages || 0) + 1;
        (diag.skipped = diag.skipped || []).push(src);
        continue;
      }
      const b = { _type: 'image', _key: key() };
      if (assetId) b.asset = { _type: 'reference', _ref: assetId };
      else b._pendingSrc = src; // dry-run (preview)
      if (imgWidth) b.largura = imgWidth;
      blocks.push(b);
      continue;
    }
    if (iframe || tag === 'iframe') {
      diag.flags.add('iframe');
      blocks.push({ _type: 'codigoEmbutido', _key: key(), codigo: (iframe || el).outerHTML });
      continue;
    }
    // custom code / embed do Webflow: div.w-embed, figure de embed, ou QUALQUER
    // bloco contendo <script>. Preservado como HTML cru (não achatar pra texto).
    // ⚠ <script> não executa via set:html no site estático — só flag pra revisão.
    const cls = (el.getAttribute && (el.getAttribute('class') || '')) || '';
    const hasScript = tag === 'script' || (el.querySelector && el.querySelector('script'));
    const isEmbed = (el.getAttribute && el.getAttribute('data-rt-embed-type')) ||
      (el.querySelector && el.querySelector('[data-rt-embed-type]')) || /embed/i.test(cls);
    if (hasScript || isEmbed) {
      diag.flags.add(hasScript ? 'script' : 'embed');
      blocks.push({ _type: 'codigoEmbutido', _key: key(), codigo: el.outerHTML });
      continue;
    }
    if (tag === 'table') {
      diag.flags.add('table');
      blocks.push({ _type: 'codigoEmbutido', _key: key(), codigo: el.outerHTML });
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      blocks.push(...await listBlocks(el, 1, diag, ctx));
      continue;
    }
    if (tag === 'hr') continue;

    const inline = await processInline(el, ctx);
    diag.links += inline.markDefs.filter(m => m._type === 'link').length;
    if (!hasText(inline.children)) continue;
    if (/^h[1-6]$/.test(tag)) blocks.push(block(+tag[1] === minLevel ? 'h2' : 'h3', inline));
    else if (tag === 'blockquote') blocks.push(block('blockquote', inline));
    else blocks.push(block('normal', inline)); // p, div e fallback
  }

  applyCartaFixes(blocks);
  return blocks;
}

// Ajustes recorrentes das publicações do Webflow (aplicados em todo lote; no-op
// quando o conteúdo não bate):
//  1) link "clique aqui para entrar em contato" apontava p/ mzrconsultoria.com
//     (site que não existe mais) -> contato do site atual.
//  2) o disclaimer padrão MMZR vira "Texto regulatório" (style regulatorio) sem
//     itálico, igual à carta de referência (Maio/2026).
const CONTATO_URL = 'https://mzrfo.com.br/#contato';
const DISCLAIMER_PREFIX = norm('Este conteúdo tem propósito exclusivamente informativo');
export function applyCartaFixes(blocks) {
  for (const b of blocks) {
    for (const md of b.markDefs || [])
      if (md._type === 'link' && /mzrconsultoria/i.test(md.href || '')) md.href = CONTATO_URL;
    if (b._type === 'block' && Array.isArray(b.children)) {
      const txt = b.children.filter(c => c._type === 'span').map(c => c.text || '').join('');
      if (norm(txt).startsWith(DISCLAIMER_PREFIX)) {
        b.style = 'regulatorio';
        for (const c of b.children) if (Array.isArray(c.marks)) c.marks = c.marks.filter(m => m !== 'em');
      }
    }
  }
  return blocks;
}
