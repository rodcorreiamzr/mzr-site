// Publicação recorrente (Carta Mensal / Comunicados) -> Sanity (publicacao).
//
// Uso:
//   export SANITY_TOKEN=$(npx sanity debug --secrets | grep 'Auth token' | awk '{print $3}')
//
//   node scripts/publicar-mensal.mjs --category carta \
//     --titulo "Carta Mensal Junho 2026" --data 2026-07-06 --dry
//   node scripts/publicar-mensal.mjs --category carta \
//     --titulo "Carta Mensal Junho 2026" --data 2026-07-06 --publish
//
//   node scripts/publicar-mensal.mjs --category comunicado \
//     --pasta "../Comunicados/2026-08-05" \
//     --titulo "Comunicado COPOM / FED 05/08" --data 2026-08-05 --dry
//
// Flags: --dry | --publish (escolher um) · --force (regrava se já existir)
//        --docx <caminho> (default: acha sozinho na pasta resolvida)
//        --pasta <caminho> (obrigatório só pra --category comunicado)
//        --pular-gerador (não roda o gerador Ruby / gerador de comunicado de novo)
//        --pular-og (não tira screenshot do card OG)
//        --og <caminho-imagem> (sobrescreve a imagem OG, manual)
//        --strip-first-heading / --keep-first-heading (default: mantém)
//
// Ao final, imprime sempre um resumo bem visível: "TUDO OK" ou "ATENÇÃO" com a
// lista de avisos. Se houver qualquer aviso, o processo termina com exit code
// 1 (aparece como falha no terminal do VS Code, mesmo sem ler o log todo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createClient } from '@sanity/client';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';
import { htmlToPortableText, slugify, key } from './lib/convert.mjs';
import { gerarComunicado } from './gerar-comunicado.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.resolve(SITE_ROOT, '..'); // .../Sites/
const GERADOR_DIR = path.join(SITES_ROOT, 'Gerador Cartas e OG');

const args = process.argv.slice(2);
const has = (n) => args.includes('--' + n);
const opt = (n, def) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };

const CATEGORY = opt('category');
const DRY = has('dry');
const PUBLISH = has('publish');
const FORCE = has('force');
const TITULO = opt('titulo');
const DATA = opt('data');
const PULAR_GERADOR = has('pular-gerador');
const PULAR_OG = has('pular-og');
const OG_OVERRIDE = opt('og');

const PRESETS = {
  carta: { tag: 'Cartas Mensais', idPrefix: 'carta-' },
  comunicado: { tag: 'Analises', idPrefix: 'analise-' },
};

// ---- avisos coletados durante a execução (banner final no fim de main()) ----
const avisos = [];

function bannerFinal() {
  const linha = '─'.repeat(64);
  console.log('\n' + linha);
  if (avisos.length === 0) {
    console.log('✅ TUDO OK — nenhum aviso.');
  } else {
    console.log(`⚠️  ATENÇÃO — ${avisos.length} aviso(s), revise antes de confiar no resultado:`);
    avisos.forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
    process.exitCode = 1; // aparece como falha no terminal do VS Code
  }
  console.log(linha + '\n');
}

function fatal(erro) {
  const linha = '─'.repeat(64);
  console.error('\n' + linha);
  console.error('❌ ERRO — a publicação parou antes de terminar:');
  console.error('   ' + (erro?.message || erro));
  console.error(linha + '\n');
  process.exitCode = 1;
}

if (!CATEGORY || !PRESETS[CATEGORY]) { console.error('Faltou --category carta|comunicado'); process.exit(1); }
if (!TITULO || !DATA) { console.error('Faltou --titulo e/ou --data (YYYY-MM-DD)'); process.exit(1); }
if (!DRY && !PUBLISH) { console.error('Escolha --dry (preview) ou --publish (grava).'); process.exit(1); }
if (CATEGORY === 'comunicado' && !opt('pasta')) { console.error('Faltou --pasta pra --category comunicado'); process.exit(1); }

const preset = PRESETS[CATEGORY];
const STRIP_HEADING = has('strip-first-heading') ? true : has('keep-first-heading') ? false : false;

const token = process.env.SANITY_TOKEN;
if (!DRY && !token) { console.error('Faltou SANITY_TOKEN'); process.exit(1); }
const client = createClient({ projectId: 'xe11jg20', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false });

// ---- 1. resolve a pasta de trabalho (roda o gerador Ruby se for carta) ----

function runGeradorRuby() {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Rodando gerador de HTMLs (ruby gerar_outputs.rb)...\n`);
    // stdin 'ignore': o script termina com "Pressione ENTER para fechar..." (pensado
    // pro duplo-clique no .command) — sem stdin aberto, o gets() recebe EOF na hora
    // em vez de travar esperando um ENTER que nunca chega.
    const proc = spawn('ruby', ['gerar_outputs.rb'], { cwd: GERADOR_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); process.stdout.write(d); });
    proc.stderr.on('data', (d) => process.stderr.write(d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`gerar_outputs.rb terminou com código ${code}`));
      resolve(out);
    });
  });
}

// As pastas de mês em Outputs/<ano>/ são pré-criadas com prefixo numérico pra
// ordenar certo no Finder (ex.: "04.Abril") — mas o gerar_outputs.rb não sabe
// disso e sempre cria/escreve numa pasta com o nome puro do mês ("Abril"). Se
// já existir uma pasta numerada pro mês, movemos o que o Ruby acabou de gerar
// pra dentro dela (onde o .docx já está) e usamos ela como pasta de trabalho.
function resolvePastaNumerada(ano, mes) {
  const anoDir = path.join(GERADOR_DIR, 'Outputs', ano);
  const bareDir = path.join(anoDir, mes);
  if (!fs.existsSync(anoDir)) return bareDir;
  const numerada = fs.readdirSync(anoDir).find((d) => new RegExp(`^\\d+\\.${mes}$`, 'i').test(d));
  if (!numerada) return bareDir;
  const numeradaDir = path.join(anoDir, numerada);
  if (path.resolve(numeradaDir) === path.resolve(bareDir)) return bareDir;
  if (!fs.existsSync(bareDir)) return numeradaDir;
  for (const f of fs.readdirSync(bareDir)) {
    fs.renameSync(path.join(bareDir, f), path.join(numeradaDir, f));
  }
  fs.rmdirSync(bareDir);
  return numeradaDir;
}
const stripNumPrefix = (nome) => nome.replace(/^\d+\./, '');

async function main() {
  let workDir;
  let mesAno = null; // { mes, ano } só existe pra carta

  if (CATEGORY === 'carta') {
    if (!PULAR_GERADOR) {
      const out = await runGeradorRuby();
      const m = out.match(/Período:\s*(\S+)\s+(\d+)/);
      if (!m) throw new Error('Não consegui extrair mês/ano do stdout do gerador.');
      mesAno = { mes: m[1], ano: m[2] };
      workDir = resolvePastaNumerada(mesAno.ano, mesAno.mes);
    } else {
      // sem rodar o gerador de novo: --docx tem que apontar direto pra pasta do mês
      // (convenção Outputs/<ano>/<mês ou NN.mês>/ — mês/ano derivados do próprio caminho)
      if (!opt('docx')) throw new Error('--pular-gerador exige --docx apontando pra pasta do mês.');
      workDir = path.dirname(path.resolve(opt('docx')));
      mesAno = { mes: stripNumPrefix(path.basename(workDir)), ano: path.basename(path.dirname(workDir)) };
    }
  } else {
    workDir = path.resolve(opt('pasta'));
  }

  if (!fs.existsSync(workDir)) throw new Error(`Pasta de trabalho não existe: ${workDir}`);
  console.log(`\n📁 Pasta de trabalho: ${workDir}`);

  // ---- 2. comunicado: gera header.html/og.html a partir de dados.json ----

  if (CATEGORY === 'comunicado' && !PULAR_GERADOR) {
    const dadosPath = path.join(workDir, 'dados.json');
    if (fs.existsSync(dadosPath)) {
      gerarComunicado(workDir);
      console.log(`✓ header.html e og.html gerados a partir de dados.json`);
    }
  }

  // ---- 3. resolve o .docx ----

  function findSingleFile(dir, re, label) {
    const files = fs.readdirSync(dir).filter((f) => re.test(f) && !f.startsWith('~$'));
    if (files.length === 0) return null;
    if (files.length > 1) throw new Error(`Achei ${files.length} ${label} em ${dir}: ${files.join(', ')} — use --docx pra escolher.`);
    return path.join(dir, files[0]);
  }

  const DOCX = opt('docx') ? path.resolve(opt('docx')) : findSingleFile(workDir, /\.docx?$/i, '.docx');
  if (!DOCX || !fs.existsSync(DOCX)) throw new Error(`Não achei nenhum .docx em ${workDir} (ou o caminho de --docx não existe).`);
  console.log(`📄 Documento: ${path.basename(DOCX)}`);

  // ---- 4. screenshot do card OG (Puppeteer) ----

  async function screenshotOgCard(htmlPath, outPngPath) {
    const browser = await puppeteer.launch();
    try {
      const page = await browser.newPage();
      // viewport maior que o card (1200×630): a página em volta tem padding
      // (body) e o wrapper ".preview" usa overflow:auto — com viewport igual
      // ao tamanho do card, esse wrapper fica mais estreito que os 1200px e
      // recorta a borda direita do card no screenshot (o Puppeteer não rola
      // esse overflow interno sozinho, só o scroll da página).
      await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
      await page.goto(pathToFileURL(htmlPath).href);
      await page.evaluate(() => document.fonts && document.fonts.ready);
      const card = await page.$('#og-card');
      if (!card) throw new Error(`#og-card não encontrado em ${htmlPath}`);
      // card.screenshot() usa getBoundingClientRect() (valores fracionários)
      // pra recortar — a 2x de escala, um arredondamento de sub-pixel pode
      // sobrar como frestinha de fundo na borda. page.screenshot({clip}) com
      // valores inteiros evita isso (sem folga extra, pra não capturar fundo
      // do lado de fora do card).
      const rect = await card.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      await page.screenshot({
        path: outPngPath,
        clip: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    } finally {
      await browser.close();
    }
  }

  let ogPngPath = null;
  const outName = CATEGORY === 'carta'
    ? `mmzr_og_${mesAno.mes.toLowerCase()}${mesAno.ano}.png`
    : `mmzr_og_${path.basename(workDir)}.png`;
  const outPath = path.join(workDir, outName);
  if (!PULAR_OG) {
    const ogHtmlName = CATEGORY === 'carta'
      ? `mmzr_og_mes_${mesAno.mes.toLowerCase()}${mesAno.ano}.html`
      : 'og.html';
    const ogHtmlPath = path.join(workDir, ogHtmlName);
    if (fs.existsSync(ogHtmlPath)) {
      try {
        await screenshotOgCard(ogHtmlPath, outPath);
        ogPngPath = outPath;
        console.log(`✓ Capa OG gerada: ${outName}`);
      } catch (e) {
        console.warn(`⚠ Não consegui gerar a capa OG automaticamente (${e.message}).`);
        avisos.push(`capa OG não pôde ser gerada automaticamente (${e.message}) — publica sem imagem, a menos que use --og`);
      }
    } else if (CATEGORY === 'carta') {
      avisos.push(`nenhum "${ogHtmlName}" encontrado na pasta — carta vai sem capa OG automática`);
    }
  }

  // --pular-og (ou screenshot que falhou): reaproveita a PNG já gerada na
  // pasta. Sem isso a republicação sobe o documento SEM ogImagem e apaga a
  // capa que já estava no ar — o publish é createOrReplace, regrava o doc
  // inteiro, não faz merge de campos.
  if (!ogPngPath && fs.existsSync(outPath)) {
    ogPngPath = outPath;
    console.log(`↺ Capa OG reaproveitada do disco: ${outName}`);
  }

  const ogFinalPath = OG_OVERRIDE ? path.resolve(OG_OVERRIDE) : ogPngPath;
  if (ogFinalPath && !fs.existsSync(ogFinalPath)) {
    avisos.push(`imagem OG apontada (${path.basename(ogFinalPath)}) não existe no disco`);
  }

  // ---- 5. escaneia arquivos de widget ----

  const WIDGET_PATTERNS = CATEGORY === 'carta'
    ? [
        { chave: 'indicadores', re: /^mmzr_tabela_indicadores_.*\.html$/i },
        { chave: 'posicionamento', re: /^mmzr_tabela_posicionamento_.*\.html$/i },
        { chave: 'mercado', re: /^mmzr_indicadores_mercado_.*\.html$/i },
        { chave: 'rentabilidades', re: /^mmzr_tabela_rentabilidades_.*\.html$/i },
        // o gerador Ruby escreve com sufixo do mês (Ranking_Anual_Multimercado_julho2026.html);
        // versões rebrandadas à mão (Junho/26) vieram sem sufixo — aceita os dois
        { chave: 'ranking', re: /^Ranking_Anual_Multimercado.*\.html$/i },
      ]
    : [{ chave: 'header', re: /^header\.html$/i }];

  const arquivosNaPasta = fs.readdirSync(workDir);
  const widgets = {};
  for (const { chave, re } of WIDGET_PATTERNS) {
    const achado = arquivosNaPasta.find((f) => re.test(f));
    if (achado) widgets[chave] = fs.readFileSync(path.join(workDir, achado), 'utf8');
  }
  console.log(`🧩 Widgets encontrados: ${Object.keys(widgets).length ? Object.keys(widgets).join(', ') : '(nenhum)'}`);

  // ---- 6. .docx -> HTML (mammoth) -> Portable Text (convert.mjs) ----

  const assetCache = new Map();
  async function uploadImageReal(src) {
    if (assetCache.has(src)) return assetCache.get(src);
    try {
      let buf, filename;
      if (/^data:/.test(src)) {
        const m = src.match(/^data:([^;]+);base64,([\s\S]*)$/);
        if (!m) throw new Error('data URI inválida');
        buf = Buffer.from(m[2], 'base64');
        const ext = (m[1].split('/')[1] || 'png').replace('+xml', '');
        filename = `imagem-docx-${key()}.${ext}`;
      } else if (/^https?:\/\//i.test(src)) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
        filename = decodeURIComponent(src.split('/').pop().split('?')[0]);
      } else {
        throw new Error(`src não suportado: ${src.slice(0, 40)}`);
      }
      const asset = await client.assets.upload('image', buf, { filename });
      assetCache.set(src, asset._id);
      return asset._id;
    } catch (e) {
      console.warn(`⚠ imagem ignorada (${e.message})`);
      avisos.push(`imagem do .docx ignorada (${e.message})`);
      assetCache.set(src, null);
      return null;
    }
  }
  const uploadImage = DRY ? async () => null : uploadImageReal;

  const mammothResult = await mammoth.convertToHtml(
    { path: DOCX },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64');
        return { src: `data:${image.contentType};base64,${base64}` };
      }),
    },
  );
  if (mammothResult.messages.length) {
    console.log(`\n⚠ Avisos do mammoth (conversão .docx):`);
    mammothResult.messages.slice(0, 10).forEach((m) => console.log(`   ${m.message}`));
    for (const m of mammothResult.messages) avisos.push(`conversão .docx: ${m.message}`);
  }

  const diag = { tags: {}, images: 0, links: 0, flags: new Set(), strippedHeading: null };
  let corpo = await htmlToPortableText(mammothResult.value, {
    uploadImage,
    uploadPdf: async () => null,
    stripFirstHeading: STRIP_HEADING,
    diag,
    dry: DRY,
  });

  // ---- 7. substitui marcadores [[TABELA:chave]] pelos widgets ----

  // Idealmente o marcador fica sozinho num parágrafo, mas o analista às vezes
  // usa quebra de linha (Shift+Enter) em vez de parágrafo antes do título da
  // seção seguinte, e marcador + título acabam no mesmo bloco. Como o marcador
  // nunca vem em negrito (o título sim), ele aparece isolado no 1º span com
  // texto do bloco — detectamos por aí e separamos o resto como bloco novo.
  const MARKER_RE = /^\[\[TABELA:(\w+)\]\]$/;

  // Marcadores implícitos: frases que o analista escreve no lugar do marcador
  // quando manda o widget "por fora" (ex.: o HTML do ranking multimercado, que
  // chega por e-mail em vez de sair da planilha). O parágrafo inteiro é trocado
  // pelo widget correspondente.
  const MARCADORES_IMPLICITOS = [
    // "Link do HMTL da tabela ranking anual enviado no paralelo" (o typo HMTL/HTML
    // varia) — tolerante de propósito: só precisa citar link + tabela do ranking
    { chave: 'ranking', re: /^link\b.*\btabela ranking\b/i },
  ];

  // Anotações cruas do analista que às vezes vêm coladas no marcador (as fontes
  // que alimentam a tabela, copiadas da planilha). Não vão pro ar — a tabela já
  // mostra o mesmo conteúdo.
  const NOTAS_CRUAS_RE = /^novo formato\b/i;

  function splitLeadingMarker(b) {
    if (b._type !== 'block' || !b.children?.length) return null;
    const spans = b.children;
    let i = 0;
    while (i < spans.length && !(spans[i].text || '').trim()) i++;
    if (i >= spans.length) return null;
    const primeiro = (spans[i].text || '').trim();
    const m = primeiro.match(MARKER_RE);
    if (!m) {
      const textoTotal = spans.map((c) => c.text || '').join('').trim();
      const implicito = MARCADORES_IMPLICITOS.find((x) => x.re.test(textoTotal));
      if (!implicito) return null;
      avisos.push(`"${textoTotal.slice(0, 60)}" tratado como marcador implícito de [[TABELA:${implicito.chave}]]`);
      return { chave: implicito.chave, remainderBlock: null };
    }
    let resto = spans.slice(i + 1);
    while (resto.length && !(resto[0].text || '').trim()) resto.shift();
    const restoTexto = resto.map((c) => c.text || '').join('').trim();
    if (resto.length && NOTAS_CRUAS_RE.test(restoTexto)) {
      avisos.push(`anotações cruas depois de [[TABELA:${m[1]}]] descartadas ("${restoTexto.slice(0, 40)}…")`);
      resto = [];
    }
    return { chave: m[1], remainderBlock: resto.length ? { ...b, _key: key(), children: resto } : null };
  }

  const usados = new Set();
  const corpoComWidgets = [];
  for (const b of corpo) {
    const split = splitLeadingMarker(b);
    if (split) {
      const { chave, remainderBlock } = split;
      if (widgets[chave]) {
        corpoComWidgets.push({ _type: 'codigoEmbutido', _key: key(), codigo: widgets[chave] });
        usados.add(chave);
      } else {
        avisos.push(`marcador [[TABELA:${chave}]] sem arquivo correspondente — removido`);
      }
      if (remainderBlock) corpoComWidgets.push(remainderBlock);
      continue;
    }
    corpoComWidgets.push(b);
  }
  // Título de seção pra widget anexado no fim (sem marcador no texto): a tabela
  // de rentabilidades fecha a carta debaixo do H2 "RENTABILIDADES" (padrão desde
  // a carta de Junho/26) — sem ele a tabela apareceria solta, fora do índice.
  const TITULO_ANEXO = { rentabilidades: 'RENTABILIDADES' };
  // Exceção: o card de decisões do comunicado é o resumo visual da notícia e
  // abre o texto (foi assim no comunicado de Junho/26). Quando o analista
  // escreve o .docx do zero, sem o marcador do modelo, ele entra no topo — não
  // anexado no fim como os widgets da carta.
  const WIDGET_NO_TOPO = new Set(['header']);
  for (const chave of Object.keys(widgets)) {
    if (!usados.has(chave)) {
      if (WIDGET_NO_TOPO.has(chave)) {
        corpoComWidgets.unshift({ _type: 'codigoEmbutido', _key: key(), codigo: widgets[chave] });
        avisos.push(`arquivo do widget "${chave}" não tinha marcador no texto — inserido no topo`);
        continue;
      }
      const titulo = TITULO_ANEXO[chave];
      if (titulo) {
        corpoComWidgets.push({
          _type: 'block', _key: key(), style: 'h2', markDefs: [],
          children: [{ _type: 'span', _key: key(), text: titulo, marks: ['strong'] }],
        });
      }
      corpoComWidgets.push({ _type: 'codigoEmbutido', _key: key(), codigo: widgets[chave] });
      avisos.push(`arquivo do widget "${chave}" não tinha marcador no texto — anexado ao final${titulo ? ` (com H2 "${titulo}")` : ''}`);
    }
  }

  // ---- 7b. carta: promove pseudo-títulos em negrito a H2 (alimenta o índice)
  // e remove o nome do revisor no fim ----
  //
  // O analista escreve os títulos de seção em negrito (não usa o estilo real
  // de título do Word), então o mammoth não gera <hN> e essas seções ficam de
  // fora do índice/TOC. Ele também deixa "Título: Nome (Apelido)" no fim do
  // título — convenção pra facilitar revisão interna — que não deve ir pro ar.
  // Às vezes o título nem fica num parágrafo próprio: o analista usa quebra de
  // linha (Shift+Enter) antes do texto corrido, e título+corpo grudam no mesmo
  // bloco — por isso também extraímos um trecho em negrito no INÍCIO do bloco
  // quando ele tem a cara da convenção "Título: Nome (Apelido)" (evita separar
  // negrito usado só como ênfase em outros lugares da carta).
  // Nunca mexe em blocos que comecem com "Fonte" (citação real).
  if (CATEGORY === 'carta') {
    const REVIEW_NAME_RE = /\s*:\s*\p{Lu}[\p{L}.]*(?:\s+\p{Lu}[\p{L}.]*)*\s*(?:\([^)]*\))?\s*$/u;
    const isBoldOnly = (c) => c._type === 'span' && (c.marks || []).length === 1 && c.marks[0] === 'strong';
    const truncateSpans = (spans, keepLen) => {
      const out = [];
      let used = 0;
      for (const s of spans) {
        const t = s.text || '';
        if (used >= keepLen) break;
        if (used + t.length <= keepLen) { out.push(s); used += t.length; }
        else { out.push({ ...s, text: t.slice(0, keepLen - used) }); used = keepLen; }
      }
      return out;
    };
    // recebe um bloco 100% negrito e devolve a versão H2, maiúscula, sem nome de revisão
    function tituloizar(bloco) {
      // remove quebras de linha soltas no início (ex.: "<strong><br /><br />Título...")
      let ini = 0;
      while (ini < bloco.children.length && !(bloco.children[ini].text || '').trim()) ini++;
      const spans = bloco.children.slice(ini);
      const textoCompleto = spans.map((c) => c.text || '').join('');
      const textoAparado = textoCompleto.trim();
      let filhos = spans;
      const m = textoAparado.match(REVIEW_NAME_RE);
      if (m) {
        const novoAparado = textoAparado.slice(0, m.index).trimEnd();
        if (novoAparado) {
          const inicio = textoCompleto.length - textoCompleto.trimStart().length;
          filhos = truncateSpans(spans, inicio + novoAparado.length);
          avisos.push(`título "${novoAparado}" — nome de revisão removido do fim ("${m[0].trim()}")`);
        }
      }
      return { ...bloco, style: 'h2', children: filhos.map((c) => (c._type === 'span' ? { ...c, text: (c.text || '').toUpperCase() } : c)) };
    }

    const corpoFinal = [];
    for (const b of corpoComWidgets) {
      if (b._type !== 'block' || !b.children?.length) { corpoFinal.push(b); continue; }
      const spans = b.children;
      const visiveis = spans.filter((c) => c._type === 'span' && (c.text || '').trim());
      if (!visiveis.length) { corpoFinal.push(b); continue; }
      const textoTotal = spans.map((c) => c.text || '').join('').trim();
      if (/^fonte\b/i.test(textoTotal)) { corpoFinal.push(b); continue; }

      if (visiveis.every(isBoldOnly)) {
        corpoFinal.push(tituloizar({ ...b, children: spans.filter((c) => c._type === 'span') }));
        continue;
      }

      // bloco misto: tenta extrair um título em negrito colado no início
      let i = 0;
      while (i < spans.length && !(spans[i].text || '').trim()) i++;
      if (i < spans.length && isBoldOnly(spans[i])) {
        let j = i, fimNegrito = i;
        while (j < spans.length) {
          const t = spans[j].text || '';
          if (!t.trim()) { j++; continue; }
          if (isBoldOnly(spans[j])) { fimNegrito = j; j++; continue; }
          break;
        }
        const tituloSpans = spans.slice(i, fimNegrito + 1);
        const tituloTexto = tituloSpans.map((c) => c.text || '').join('').trim();
        const resto = spans.slice(fimNegrito + 1);
        while (resto.length && !(resto[0].text || '').trim()) resto.shift();
        if (resto.length && REVIEW_NAME_RE.test(tituloTexto)) {
          corpoFinal.push(tituloizar({ ...b, _key: key(), children: tituloSpans }));
          corpoFinal.push({ ...b, _key: key(), children: resto });
          continue;
        }
      }
      corpoFinal.push(b);
    }

    // 7c. subtítulo da carta -> H3.
    //
    // O analista escreve o subtítulo do mês colado no 1º parágrafo do "Resumo do
    // time de estratégia", separado só por quebra de linha e prefixado por
    // "Carta - " (ex.: "Carta - Ormuz aberto, ..."). Vira um H3 próprio, sem o
    // prefixo — como ficou a carta de Junho/26 (ajustada à mão na época).
    const SUBTITULO_RE = /^carta\s*[-–—]\s*/i;
    for (let i = 1; i < corpoFinal.length; i++) {
      const anterior = corpoFinal[i - 1];
      const b = corpoFinal[i];
      if (anterior?._type !== 'block' || anterior.style !== 'h2') continue;
      if (b._type !== 'block' || (b.style && b.style !== 'normal') || !b.children?.length) continue;
      const primeiro = b.children[0];
      if (primeiro?._type !== 'span' || !SUBTITULO_RE.test((primeiro.text || '').trim())) continue;
      // só separa se o subtítulo termina ali mesmo (o corpo vem depois da quebra)
      const seguintes = b.children.slice(1);
      if (!seguintes.length || (seguintes[0].text || '').trim()) continue;
      const texto = (primeiro.text || '').trim().replace(SUBTITULO_RE, '');
      const resto = seguintes.slice();
      while (resto.length && !(resto[0].text || '').trim()) resto.shift();
      if (!texto || !resto.length) continue;
      corpoFinal.splice(i, 1,
        { ...b, _key: key(), style: 'h3', children: [{ ...primeiro, _key: key(), text: texto }] },
        { ...b, _key: key(), children: resto });
      avisos.push(`subtítulo "${texto}" promovido a H3 (prefixo "Carta -" removido)`);
      i++;
    }

    // 7c-bis. H3 "Desempenho dos portfólios e posicionamento" antes do parágrafo
    // que abre a seção de desempenho das carteiras ("Em julho, observamos..."),
    // logo acima dos parágrafos "Na carteira Conservadora/Moderada/...". O docx
    // não traz esse subtítulo, mas ele existe nas cartas publicadas desde
    // Junho/26 (era inserido à mão) e alimenta o índice da página.
    const H3_DESEMPENHO = 'Desempenho dos portfólios e posicionamento';
    const textoDoBloco = (b) => (b?._type === 'block' ? (b.children || []).map((c) => c.text || '').join('').trim() : '');
    const mesmoTitulo = (t) => t.trim().toLowerCase().replace(/[.:]$/, '') === H3_DESEMPENHO.toLowerCase();
    // já é um bloco próprio? (parágrafo solto) — só vira H3, sem inserir outro
    const iSolto = corpoFinal.findIndex((b) => b._type === 'block' && mesmoTitulo(textoDoBloco(b)));
    if (iSolto >= 0 && corpoFinal[iSolto].style !== 'h3') {
      corpoFinal[iSolto] = { ...corpoFinal[iSolto], style: 'h3' };
      avisos.push(`parágrafo "${H3_DESEMPENHO}" promovido a H3`);
    }
    const jaTem = corpoFinal.some((b) => b.style === 'h3' && mesmoTitulo(textoDoBloco(b)));
    const iCarteira = corpoFinal.findIndex((b) => /^Na carteira Conservadora\b/i.test(textoDoBloco(b)));
    if (!jaTem && iCarteira > 0) {
      const anterior = corpoFinal[iCarteira - 1];
      const alvo = /^Em \p{L}+,?\s+observamos\b/iu.test(textoDoBloco(anterior)) ? iCarteira - 1 : iCarteira;

      // O analista costuma escrever esse subtítulo colado no FIM do parágrafo
      // anterior (Shift+Enter em vez de parágrafo novo). Nesse caso, tira de lá
      // em vez de duplicar o texto na página.
      const acima = corpoFinal[alvo - 1];
      if (acima?._type === 'block' && Array.isArray(acima.children)) {
        const spans = acima.children.slice();
        let ult = spans.length - 1;
        while (ult >= 0 && !(spans[ult].text || '').trim()) ult--;
        const textoUlt = ult >= 0 ? (spans[ult].text || '') : '';
        let achou = false;
        if (mesmoTitulo(textoUlt)) {
          spans.splice(ult, spans.length - ult);
          achou = true;
        } else if (mesmoTitulo(textoUlt.split('\n').pop() || '')) {
          spans[ult] = { ...spans[ult], text: textoUlt.slice(0, textoUlt.lastIndexOf('\n')) };
          achou = true;
        }
        if (achou) {
          while (spans.length && !(spans[spans.length - 1].text || '').trim()) spans.pop();
          corpoFinal[alvo - 1] = { ...acima, children: spans };
          avisos.push(`"${H3_DESEMPENHO}" retirado do fim do parágrafo anterior (virou o H3)`);
        }
      }

      corpoFinal.splice(alvo, 0, {
        _type: 'block', _key: key(), style: 'h3', markDefs: [],
        children: [{ _type: 'span', _key: key(), text: H3_DESEMPENHO, marks: [] }],
      });
      avisos.push(`H3 "${H3_DESEMPENHO}" inserido antes de "${textoDoBloco(corpoFinal[alvo + 1]).slice(0, 40)}…"`);
    }

    // 7d. "Fonte: ..." logo depois de uma imagem vira a legenda daquela imagem.
    const comLegendas = [];
    for (const b of corpoFinal) {
      const anterior = comLegendas[comLegendas.length - 1];
      const texto = b._type === 'block' ? (b.children || []).map((c) => c.text || '').join('').trim() : '';
      if (anterior?._type === 'image' && /^fonte\b/i.test(texto) && texto.length < 120) {
        anterior.legenda = texto;
        avisos.push(`"${texto}" virou legenda da imagem anterior`);
        continue;
      }
      comLegendas.push(b);
    }

    corpoComWidgets.length = 0;
    corpoComWidgets.push(...comLegendas);
  }

  corpo = corpoComWidgets;

  // ---- 7f. comunicado: pseudo-títulos em negrito -> H2 (país) / H3 (visão) ----
  //
  // Mesmo problema da carta: o analista não usa os estilos de título do Word,
  // escreve "Brasil", "EUA" e "Visão MZR:" em negrito num parágrafo solto. No
  // comunicado publicado de Junho/26 (gabarito) esses viraram H2 (país) e H3
  // (visão) — é o que alimenta o índice da página. O ":" do fim sai.
  if (CATEGORY === 'comunicado') {
    const VISAO_RE = /^vis[ãa]o\s+m{1,2}zr\b/i;
    const isBoldOnly = (c) => c._type === 'span' && (c.marks || []).length === 1 && c.marks[0] === 'strong';
    for (let i = 0; i < corpo.length; i++) {
      const b = corpo[i];
      if (b._type !== 'block' || (b.style && b.style !== 'normal') || !b.children?.length) continue;
      const spans = b.children.filter((c) => c._type === 'span');
      const visiveis = spans.filter((c) => (c.text || '').trim());
      if (!visiveis.length || !visiveis.every(isBoldOnly)) continue;
      const texto = visiveis.map((c) => c.text || '').join('').trim().replace(/\s*:\s*$/, '');
      // negrito longo é ênfase de parágrafo inteiro, não título de seção
      if (!texto || texto.length > 60) continue;
      const style = VISAO_RE.test(texto) ? 'h3' : 'h2';
      corpo[i] = { ...b, style, markDefs: [], children: [{ _type: 'span', _key: key(), marks: [], text: texto }] };
      avisos.push(`"${texto}" promovido a ${style.toUpperCase()}`);
    }

    // rodapé regulatório — texto idêntico ao dos comunicados anteriores (o
    // .docx do modelo traz um parecido, mas o do analista costuma vir sem).
    const jaTemRegulatorio = corpo.some((b) => b._type === 'block' && b.style === 'regulatorio');
    if (!jaTemRegulatorio) {
      corpo.push({
        _type: 'block', _key: key(), style: 'regulatorio', markDefs: [],
        children: [{
          _type: 'span', _key: key(), marks: [],
          text: 'Este material foi elaborado pela MMZR Family Office exclusivamente para fins informativos, não constituindo oferta, solicitação, recomendação ou análise de investimento, e não considera objetivos, situação financeira ou necessidades específicas de cada investidor. Rentabilidade passada não representa garantia de rentabilidade futura. Elaborado em conformidade com o Código ANBIMA de Regulação e Melhores Práticas.',
        }],
      });
      console.log('✓ texto regulatório padrão anexado ao final');
    }
  }

  // ---- 7e. rodapé padrão da carta (CTA + texto regulatório) ----
  //
  // Fecha toda carta mensal desde Abril/26 (antes era colado à mão no Studio).
  // Texto idêntico ao publicado nas cartas anteriores.
  if (CATEGORY === 'carta') {
    const jaTemRegulatorio = corpo.some((b) => b._type === 'block' && b.style === 'regulatorio');
    if (!jaTemRegulatorio) {
      const linkKey = key();
      corpo.push({
        _type: 'block', _key: key(), style: 'normal',
        markDefs: [{ _key: linkKey, _type: 'link', blank: false, href: 'https://mzrfo.com.br/#contato' }],
        children: [
          { _type: 'span', _key: key(), marks: [], text: 'Caso queira saber mais sobre nossos serviços ' },
          { _type: 'span', _key: key(), marks: [linkKey], text: 'clique aqui para entrar em contato\n‍' },
        ],
      });
      corpo.push({
        _type: 'block', _key: key(), style: 'regulatorio', markDefs: [],
        children: [{
          _type: 'span', _key: key(), marks: [],
          text: 'Este conteúdo tem propósito exclusivamente informativo e se baseia em dados estatísticos, metodologias probabilísticas, fatos concretos do mercado financeiro e em resultados financeiros apurados e nas conclusões da MMZR Family Office considerando o perfil de clientes que se adequem aos ativos e estratégias que compõem as carteiras apresentadas acima. Em nenhum momento, o conteúdo desta mensagem representa recomendações de investimento financeiro de qualquer natureza. Para obter uma recomendação de investimento personalizada da MMZR Family Office acesse nosso site mmzrfo.com.br e entre em contato conosco.',
        }],
      });
      console.log('✓ rodapé padrão (CTA + texto regulatório) anexado ao final');
    }
  }

  // ---- 8. monta o documento ----

  const slug = slugify(TITULO);
  const _id = preset.idPrefix + slug;

  const doc = {
    _id,
    _type: 'publicacao',
    titulo: TITULO,
    slug: { _type: 'slug', current: slug },
    tag: preset.tag,
    data: DATA,
    corpo,
  };

  // ---- 9. relatório / dry / publish ----

  const imgs = corpo.filter((b) => b._type === 'image').length;
  const embeds = corpo.filter((b) => b._type === 'codigoEmbutido').length;
  console.log(`\n=== ${CATEGORY} · tag "${preset.tag}" ===`);
  console.log(`título: ${TITULO}`);
  console.log(`slug: ${slug}  (_id: ${_id})`);
  console.log(`data: ${DATA}`);
  console.log(`blocos: ${corpo.length}  imagens: ${imgs}  embeds: ${embeds}  links: ${diag.links}`);
  console.log(`capa OG: ${ogFinalPath ? path.basename(ogFinalPath) + (fs.existsSync(ogFinalPath) ? '' : ' (ARQUIVO NÃO ENCONTRADO)') : 'nenhuma'}`);

  if (DRY) {
    const previewPath = DOCX.replace(/\.docx?$/i, '.preview.json');
    fs.writeFileSync(previewPath, JSON.stringify(doc, null, 2));
    console.log(`\n[DRY] nada gravado. Preview: ${path.basename(previewPath)}`);
    return;
  }

  const existing = await client.fetch(`*[_id == $id][0]{_id}`, { id: _id });
  if (existing && !FORCE) {
    console.log(`\nJá existe um documento com _id "${_id}" — use --force pra regravar. Nada feito.`);
    avisos.push(`_id "${_id}" já existia e --force não foi usado — nada foi gravado`);
    return;
  }

  if (ogFinalPath && fs.existsSync(ogFinalPath)) {
    const buf = fs.readFileSync(ogFinalPath);
    const asset = await client.assets.upload('image', buf, { filename: path.basename(ogFinalPath) });
    doc.ogImagem = { _type: 'image', asset: { _type: 'reference', _ref: asset._id } };
  }

  await client.createOrReplace(doc);
  console.log(`\n✅ Publicado: ${_id}`);
}

try {
  await main();
  bannerFinal();
} catch (e) {
  fatal(e);
}
