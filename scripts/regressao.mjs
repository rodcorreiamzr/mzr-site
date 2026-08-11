// Teste de regressão do publicar-mensal: prova que uma mudança no script NÃO
// altera o documento que vai pro Sanity.
//
// Como funciona: roda os dois --dry reais que já fecharam publicações (Carta de
// Julho/26 e Comunicado de 05/08) e compara o .preview.json com o snapshot
// guardado em scripts/__snapshots__/. O .preview.json é literalmente o objeto
// passado pro createOrReplace — snapshot idêntico = publicação idêntica. Não é
// amostragem, é o artefato inteiro.
//
// Uso:
//   node scripts/regressao.mjs              # compara com os snapshots
//   node scripts/regressao.mjs --atualizar  # regrava os snapshots
//
// --atualizar só depois de conferir que a mudança no output é intencional. O
// jeito honesto de criar um snapshot é a partir do código já validado: commite
// o que funciona, rode --atualizar, aí mexa.
//
// Nada aqui grava no Sanity nem toca no .docx do analista. Os .preview.json /
// .preview.txt das pastas de trabalho são sobrescritos (são regeneráveis).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const SITES_ROOT = path.resolve(SITE_ROOT, '..');
const SNAP_DIR = path.join(__dirname, '__snapshots__');
const ATUALIZAR = process.argv.includes('--atualizar');

// Casos reais, não fixtures inventadas: os dois últimos conteúdos publicados,
// que exercitam os dois caminhos (carta com 5 widgets/imagens/legendas, e
// comunicado com card no topo, negrito→H2/H3 e rodapé regulatório).
const CASOS = [
  {
    nome: 'carta-julho-2026',
    preview: path.join(SITES_ROOT, 'Gerador Cartas e OG/Outputs/2026/07.Julho/Indicadores e Textos - Julho26.preview.json'),
    args: ['--category', 'carta', '--rapido',
      '--docx', path.join(SITES_ROOT, 'Gerador Cartas e OG/Outputs/2026/07.Julho/Indicadores e Textos - Julho26.docx'),
      '--titulo', 'Carta Mensal Julho 2026', '--data', '2026-08-04', '--dry'],
  },
  {
    nome: 'comunicado-2026-08-05',
    preview: path.join(SITES_ROOT, 'Comunicados/2026-08-05/Superquarta 2026_07_29.preview.json'),
    args: ['--category', 'comunicado', '--rapido',
      '--pasta', path.join(SITES_ROOT, 'Comunicados/2026-08-05'),
      '--titulo', 'Comunicado COPOM / FED 05/08', '--data', '2026-08-05', '--dry'],
  },
];

// Os _key do Portable Text saem de Math.random() (convert.mjs) e mudam a cada
// rodada mesmo sem mudança nenhuma de conteúdo. Renumerar por ordem de
// aparição, mapeando por valor, preserva o vínculo markDefs._key ↔ marks: se um
// link se soltar do texto, o diff acusa; se só a chave aleatória mudou, não.
function normalizar(doc) {
  const mapa = new Map();
  const KEY_RE = /^k[0-9a-z]+$/;
  const troca = (v) => { if (!mapa.has(v)) mapa.set(v, 'k' + mapa.size); return mapa.get(v); };
  const walk = (n) => {
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(n)) {
        if (k === '_key' && typeof v === 'string') out[k] = troca(v);
        else if (k === 'marks' && Array.isArray(v)) out[k] = v.map((m) => (KEY_RE.test(m) ? troca(m) : m));
        else out[k] = walk(v);
      }
      return out;
    }
    return n;
  };
  return JSON.stringify(walk(doc), null, 2) + '\n';
}

fs.mkdirSync(SNAP_DIR, { recursive: true });
let falhas = 0;
let pulados = 0;

// caminho do --docx ou do --pasta, o que o caso usar
const alvoDoCaso = (args) => {
  const i = args.indexOf('--docx');
  const j = args.indexOf('--pasta');
  return i >= 0 ? args[i + 1] : j >= 0 ? args[j + 1] : null;
};

for (const caso of CASOS) {
  process.stdout.write(`▶ ${caso.nome} ... `);
  const alvo = alvoDoCaso(caso.args);
  if (!alvo || !fs.existsSync(alvo)) {
    console.log('PULADO (pasta de trabalho não existe nesta máquina)');
    pulados++;
    continue;
  }

  // exit code 1 é o normal aqui: o script sai 1 sempre que há avisos, e os dois
  // casos têm. Erro de verdade aparece como "❌ ERRO" no output.
  const r = spawnSync('node', [path.join(__dirname, 'publicar-mensal.mjs'), ...caso.args],
    { cwd: SITE_ROOT, encoding: 'utf8' });
  const saida = (r.stdout || '') + (r.stderr || '');
  if (/❌ ERRO/.test(saida) || !fs.existsSync(caso.preview)) {
    console.log('ERRO ao rodar');
    console.log(saida.split('\n').slice(-15).join('\n'));
    falhas++;
    continue;
  }

  const atual = normalizar(JSON.parse(fs.readFileSync(caso.preview, 'utf8')));
  const snapPath = path.join(SNAP_DIR, caso.nome + '.json');

  if (ATUALIZAR || !fs.existsSync(snapPath)) {
    fs.writeFileSync(snapPath, atual);
    console.log(fs.existsSync(snapPath) && !ATUALIZAR ? 'snapshot criado' : 'snapshot atualizado');
    continue;
  }

  if (atual === fs.readFileSync(snapPath, 'utf8')) {
    console.log('ok — idêntico ao snapshot');
  } else {
    console.log('DIFERENTE do snapshot');
    const a = fs.readFileSync(snapPath, 'utf8').split('\n');
    const b = atual.split('\n');
    let mostradas = 0;
    for (let i = 0; i < Math.max(a.length, b.length) && mostradas < 20; i++) {
      if (a[i] !== b[i]) { console.log(`   linha ${i + 1}:\n   - ${a[i]}\n   + ${b[i]}`); mostradas++; }
    }
    if (a.length !== b.length) console.log(`   (${a.length} linhas no snapshot vs ${b.length} agora)`);
    falhas++;
  }
}

console.log('');
if (falhas) {
  console.log(`❌ ${falhas} caso(s) mudaram de output. Se a mudança é intencional,`);
  console.log(`   confira o diff acima e rode: node scripts/regressao.mjs --atualizar\n`);
  process.exitCode = 1;
} else if (pulados) {
  // Um caso pulado não é um caso aprovado. Sem isso, perder a pasta de trabalho
  // (ou errar o caminho dela) daria "tudo ok" sem ter testado nada.
  console.log(`⚠️  nenhuma diferença, mas ${pulados} de ${CASOS.length} caso(s) foram PULADOS —`);
  console.log(`   a cobertura foi parcial. Confira os caminhos das pastas de trabalho.\n`);
  process.exitCode = 1;
} else {
  console.log(`✅ nenhuma mudança no documento publicado (${CASOS.length} casos).\n`);
}
