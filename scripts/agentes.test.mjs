// Testes das peças "para agentes de IA" que não dependem de rede:
// conversor Portable Text → Markdown, JSON-LD e regra de negociação do middleware.
//
// Uso: npm run test:agentes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portableTextToMarkdown } from '../src/lib/markdown.ts';
import { jsonLdHome, jsonLdArtigo, jsonLdScript, llmsTxt } from '../src/lib/agentes.ts';
import { querMarkdown } from '../middleware.js';

const LINK = { _key: 'L', _type: 'link', href: 'https://x.com' };
const bloco = (children, extra = {}) => ({ _type: 'block', style: 'normal', markDefs: [LINK], children, ...extra });
const span = (text, marks = []) => ({ _type: 'span', text, marks });
const md = (corpo) => portableTextToMarkdown(corpo, 'https://mzrfo.com.br/publicacoes/x').trim();

test('marcas vizinhas não geram delimitadores quebrados', () => {
  assert.equal(
    md([bloco([span('Locais', ['strong', 'em']), span(':', ['strong']), span(' CDI', ['em']), span(' fim')])]),
    '**_Locais_:** _CDI_ fim',
  );
});

test('espaço na borda fica fora do negrito', () => {
  assert.equal(md([bloco([span('um ', ['strong']), span('dois')])]), '**um** dois');
});

test('link com negrito dentro', () => {
  assert.equal(
    md([bloco([span('Veja '), span('este ', ['L']), span('link', ['L', 'strong']), span('.')])]),
    'Veja [este **link**](https://x.com).',
  );
});

test('título todo em negrito perde o negrito; zero-width some', () => {
  assert.equal(md([bloco([span('RESUMO', ['strong'])], { style: 'h2' })]), '## RESUMO');
  assert.equal(md([bloco([span('clique\u200d', ['L'])])]), '[clique](https://x.com)');
});

test('títulos, citação, legenda e regulatório', () => {
  assert.equal(md([bloco([span('T')], { style: 'h2' })]), '## T');
  assert.equal(md([bloco([span('T')], { style: 'h3' })]), '### T');
  assert.equal(md([bloco([span('C')], { style: 'blockquote' })]), '> C');
  assert.equal(md([bloco([span('L')], { style: 'legenda' })]), '*L*');
  assert.equal(md([bloco([span('R')], { style: 'regulatorio' })]), '<small>R</small>');
});

test('listas numeradas contam e não grudam em lista com marcador', () => {
  const li = (t, tipo) => bloco([span(t)], { listItem: tipo, level: 1 });
  assert.equal(md([li('a', 'bullet'), li('b', 'bullet'), li('c', 'number'), li('d', 'number')]), '- a\n- b\n\n1. c\n2. d');
});

test('imagem com legenda e gráfico interativo', () => {
  assert.equal(md([{ _type: 'image', assetUrl: 'https://img', legenda: 'Fonte: X' }]), '![Fonte: X](https://img)\n\n*Fonte: X*');
  assert.match(md([{ _type: 'codigoEmbutido', codigo: '<script>1</script>' }]), /versão HTML: https:\/\/mzrfo\.com\.br\/publicacoes\/x/);
  assert.equal(md([{ _type: 'codigoEmbutido', codigo: '<iframe src="https://youtube.com/embed/a"></iframe>' }]), '[Conteúdo incorporado](https://youtube.com/embed/a)');
});

test('JSON-LD da Home: FinancialService com identidade e sem e-mail', () => {
  const org = jsonLdHome()['@graph'].find((n) => n['@type'] === 'FinancialService');
  assert.equal(org.name, 'MZR Family Office');
  assert.equal(org.url, 'https://mzrfo.com.br/');
  assert.equal(org.taxID, '39.667.665/0001-99');
  assert.ok(org.description && org.sameAs.length === 3);
  assert.ok(!JSON.stringify(jsonLdHome()).includes('@mzrfo'), 'e-mail está fora por decisão (ver memória)');
});

test('JSON-LD de artigo e escape de </script>', () => {
  const a = jsonLdArtigo({ titulo: 'X </script>', slug: 'x', tag: 'Cartas Mensais', data: '2026-09-03' }, 'd');
  assert.equal(a['@type'], 'Article');
  assert.equal(a.articleSection, 'Carta Mensal');
  assert.ok(!jsonLdScript(a).includes('</script>'));
  assert.deepEqual(JSON.parse(jsonLdScript(a)), a);
});

test('llms.txt segue llmstxt.org e tem a seção "when to use"', () => {
  const txt = llmsTxt([{ titulo: 'Carta', slug: 'c', tag: 'Cartas Mensais', data: '2026-09-03' }]);
  assert.match(txt, /^# MZR Family Office\n\n> /);
  assert.match(txt, /^## .*when to use/m);
  assert.match(txt, /- \[Carta\]\(https:\/\/mzrfo\.com\.br\/publicacoes\/c\.md\)/);
});

test('middleware: só serve Markdown quando ele é preferido', () => {
  assert.equal(querMarkdown('text/markdown'), true);
  assert.equal(querMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(querMarkdown('text/html,application/xhtml+xml,*/*;q=0.8'), false); // navegador
  assert.equal(querMarkdown('text/html, text/markdown;q=0.5'), false);
  assert.equal(querMarkdown(''), false);
  assert.equal(querMarkdown('*/*'), false);
});
