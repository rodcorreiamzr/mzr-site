// Compara a ESTRUTURA do documento recém-gerado com a de um já publicado
// (gabarito) no Sanity. Read-only: não grava nada, em lugar nenhum.
//
// A validação que importa antes de publicar não é o texto (esse é do analista)
// — é "esta carta tem a mesma espinha da de Junho/26?". Faltou o H2 de uma
// seção, a tabela caiu fora de ordem, o rodapé regulatório sumiu. Comparar isso
// abrindo os dois documentos inteiros é caro e fácil de errar no olho; aqui sai
// só a sequência de âncoras (headings, widgets, imagens, regulatório) lado a
// lado, com o que sobra e o que falta.
//
// Uso:
//   node scripts/conferir.mjs \
//     --preview "/caminho/Indicadores e Textos - Agosto26.preview.json" \
//     --gabarito carta-carta-mensal-julho-2026
//
//   --gabarito aceita o _id de qualquer publicacao já no Sanity. Sem token
//   (SANITY_TOKEN), lê pela API pública — o dataset production é público.
import fs from 'node:fs';
import { createClient } from '@sanity/client';

const args = process.argv.slice(2);
const opt = (n, def) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };

const PREVIEW = opt('preview');
const GABARITO = opt('gabarito');
if (!PREVIEW || !GABARITO) {
  console.error('Uso: node scripts/conferir.mjs --preview <arquivo.preview.json> --gabarito <_id no Sanity>');
  process.exit(1);
}

const client = createClient({
  projectId: 'xe11jg20', dataset: 'production', apiVersion: '2024-01-01',
  token: process.env.SANITY_TOKEN, useCdn: false,
});

// Âncora = o que dá pra comparar entre dois meses diferentes. Texto de
// parágrafo muda todo mês por definição, então não entra: só a moldura.
function ancoras(corpo) {
  const out = [];
  for (const b of corpo || []) {
    if (b._type === 'image') { out.push('[imagem]'); continue; }
    if (b._type === 'codigoEmbutido') {
      const c = b.codigo || '';
      const dica = /mzrdec-card/.test(c) ? 'card de decisões'
        : /lt-wrap|lt-legend/.test(c) ? 'ranking multimercado'
        : /alloc-bar/.test(c) ? 'tabela rentabilidades'
        : /chart-canvas-wrap/.test(c) ? 'indicadores de mercado'
        : /badge b-[no]/.test(c) ? 'tabela posicionamento'
        : /col-title/.test(c) ? 'tabela indicadores'
        : 'html não identificado';
      out.push(`[embed ${dica}]`);
      continue;
    }
    if (b._type !== 'block') continue;
    if (b.style === 'regulatorio') { out.push('[regulatório]'); continue; }
    if (b.style === 'h2' || b.style === 'h3') {
      const t = (b.children || []).map((c) => c.text || '').join('').replace(/\s+/g, ' ').trim();
      // O H3 logo depois do "RESUMO DO TIME DE ESTRATÉGIA" é o tema daquele mês
      // ("Ormuz aberto...", "A volatilidade no exterior...") — muda por
      // definição. Sem virar coringa, ele acusaria 2 diferenças (1 FALTA + 1
      // NOVO) em toda carta, e um relatório que sempre reclama vira ruído.
      const anterior = out[out.length - 1] || '';
      if (b.style === 'h3' && /^H2 RESUMO DO TIME/i.test(anterior)) {
        out.push('H3 <tema do mês>');
      } else {
        out.push(`${b.style.toUpperCase()} ${t}`);
      }
    }
  }
  return out;
}

// Normaliza pra comparar título de seção entre meses: "Carta Mensal Julho 2026"
// e "...Agosto 2026" são a mesma âncora. Fora meses/anos, compara sem acento e
// sem pontuação — o analista varia ":" e maiúscula de um mês pro outro.
const MESES = 'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';
const chave = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(new RegExp(`\\b(${MESES})\\b`, 'gi'), '<mês>')
  .replace(/\b20\d{2}\b/g, '<ano>')
  // "MMZR" (marca antiga, ainda nos documentos anteriores ao rebrand) e "MZR"
  // são a mesma âncora — senão todo "Visão MZR" acusa diferença contra qualquer
  // gabarito de antes da troca.
  .replace(/\bmm?zr\b/g, 'mzr')
  // parêntese explicativo que o analista põe ou não: "Brasil (Copom)" = "Brasil"
  .replace(/\([^)]*\)/g, '')
  .replace(/[^a-z0-9<>\s\[\]]/g, '').replace(/\s+/g, ' ').trim();

const doc = JSON.parse(fs.readFileSync(PREVIEW, 'utf8'));
const gab = await client.fetch('*[_id == $id][0]{titulo, corpo}', { id: GABARITO });
if (!gab) { console.error(`Não achei o documento "${GABARITO}" no Sanity.`); process.exit(1); }

const novo = ancoras(doc.corpo);
const velho = ancoras(gab.corpo);
const novoK = novo.map(chave);
const velhoK = velho.map(chave);

console.log(`\nnovo:     ${doc.titulo}  (${novo.length} âncoras)`);
console.log(`gabarito: ${gab.titulo}  (${velho.length} âncoras)`);
console.log('─'.repeat(72));

// Alinhamento guloso: caminha nos dois em paralelo e, quando divergem, procura
// o próximo ponto de reencontro. Suficiente pra apontar "faltou" e "novo" numa
// lista de algumas dezenas de itens — não precisa de LCS aqui.
let i = 0, j = 0, iguais = 0;
const problemas = [];
while (i < novo.length || j < velho.length) {
  if (i < novo.length && j < velho.length && novoK[i] === velhoK[j]) {
    console.log(`  ok   ${novo[i]}`); iguais++; i++; j++; continue;
  }
  const proxNoVelho = velhoK.indexOf(novoK[i], j);
  const proxNoNovo = novoK.indexOf(velhoK[j], i);
  if (j < velho.length && (proxNoNovo === -1 || (proxNoVelho !== -1 && proxNoVelho <= proxNoNovo))) {
    console.log(`  FALTA  ${velho[j]}   ← existe no gabarito, não no novo`);
    problemas.push(`falta: ${velho[j]}`); j++;
  } else if (i < novo.length) {
    console.log(`  NOVO   ${novo[i]}   ← não existe no gabarito`);
    problemas.push(`novo: ${novo[i]}`); i++;
  } else { j++; }
}

console.log('─'.repeat(72));
if (!problemas.length) {
  console.log(`✅ mesma estrutura do gabarito (${iguais} âncoras).\n`);
} else {
  console.log(`⚠️  ${problemas.length} diferença(s) de estrutura — nem toda diferença é erro`);
  console.log(`   (seção que só existe em alguns meses, tabela opcional), mas cada`);
  console.log(`   uma merece um "isso é de propósito?" antes de publicar.\n`);
  process.exitCode = 1;
}
