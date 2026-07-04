// Gera header.html (card .mzrdec pro corpo) e og.html (card #og-card pro Open
// Graph) de um comunicado Copom/FED a partir de dados.json — sem editar HTML
// à mão a cada decisão.
//
// Uso:
//   node scripts/gerar-comunicado.mjs --pasta "Sites/Comunicados/2026-08-05/"
//
// dados.json:
//   {
//     "tituloOg": "COPOM / FED 05.08",
//     "copom": { "presente": true, "taxaAnterior": "14,25%", "taxaAtual": "14,00%",
//                "decisao": "corte", "bps": 25, "subtitulo": "4ª reunião consecutiva de corte" },
//     "fed":   { "presente": true, "taxaAnterior": null, "taxaAtual": "3,50% – 3,75%",
//                "decisao": "manutencao", "bps": null, "subtitulo": "5ª reunião consecutiva de manutenção" }
//   }
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (n, def) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : def; };

export function gerarComunicado(pasta) {
  const dadosPath = path.join(pasta, 'dados.json');
  if (!fs.existsSync(dadosPath)) return null;
  const dados = JSON.parse(fs.readFileSync(dadosPath, 'utf8'));

  const lados = ['copom', 'fed'].filter((k) => dados[k]?.presente);
  if (!lados.length) throw new Error('dados.json sem nenhum comitê "presente": true (copom/fed)');

  const headerHtml = buildHeader(dados, lados);
  const ogHtml = buildOg(dados, lados);

  fs.writeFileSync(path.join(pasta, 'header.html'), headerHtml);
  fs.writeFileSync(path.join(pasta, 'og.html'), ogHtml);
  return { headerPath: path.join(pasta, 'header.html'), ogPath: path.join(pasta, 'og.html') };
}

const BADGE = {
  corte: { headerClass: 'mzrdec-cut', ogClass: 'dec-pill--corte', label: (bps) => `Corte de ${bps} bps` },
  aumento: { headerClass: 'mzrdec-hike', ogClass: 'dec-pill--aumento', label: (bps) => `Alta de ${bps} bps` },
  manutencao: { headerClass: 'mzrdec-hold', ogClass: 'dec-pill--manutencao', label: () => 'Manutenção' },
};

const COUNTRY_LABEL = { copom: 'Brasil · Copom', fed: 'EUA · FOMC' };

const FLAGS = {
  copom: `<svg width="22" height="15" viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px;display:block;">
            <rect width="24" height="16" rx="2" fill="#009C3B"/>
            <polygon points="12,2 22,8 12,14 2,8" fill="#FEDF00"/>
            <circle cx="12" cy="8" r="4" fill="#002776"/>
          </svg>`,
  fed: `<svg width="22" height="15" viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" style="border-radius:2px;display:block;">
            <rect width="24" height="16" rx="2" fill="#B22234"/>
            <rect y="1.23" width="24" height="1.23" fill="#fff"/>
            <rect y="3.69" width="24" height="1.23" fill="#fff"/>
            <rect y="6.15" width="24" height="1.23" fill="#fff"/>
            <rect y="8.61" width="24" height="1.23" fill="#fff"/>
            <rect y="11.07" width="24" height="1.23" fill="#fff"/>
            <rect y="13.53" width="24" height="1.23" fill="#fff"/>
            <rect width="10" height="8.6" fill="#3C3B6E"/>
          </svg>`,
};

// Com transição (taxaAnterior != taxaAtual): "de → PARA" (PARA em negrito só
// no header, seguindo o padrão da carta de referência). Sem transição: só o
// valor atual, sem negrito (ex.: range do Fed Funds Rate quando mantém).
function rateHtml(d, arrowTag, boldOnTransition = false) {
  if (d.taxaAnterior && d.taxaAnterior !== d.taxaAtual) {
    const atual = boldOnTransition ? `<b>${d.taxaAtual}</b>` : d.taxaAtual;
    return `${d.taxaAnterior}<span class="${arrowTag}">→</span>${atual}`;
  }
  return d.taxaAtual;
}

function buildHeader(dados, lados) {
  const cards = lados.map((k) => {
    const d = dados[k];
    const badge = BADGE[d.decisao];
    return `    <div class="mzrdec-card">
      <div class="mzrdec-top">
        <span class="mzrdec-flag">
          ${FLAGS[k]}
        </span>
        <span class="mzrdec-country">${COUNTRY_LABEL[k]}</span>
      </div>
      <div class="mzrdec-rate">${rateHtml(d, 'mzrdec-arrow', true)}</div>
      <div class="mzrdec-sub">${d.subtitulo}</div>
      <span class="mzrdec-badge ${badge.headerClass}">${badge.label(d.bps)}</span>
    </div>`;
  });

  const inner = lados.length === 2
    ? `  <div class="mzrdec-grid">\n${cards[0]}\n    <div class="mzrdec-div"></div>\n${cards[1]}\n  </div>`
    : cards[0];

  return `<style>
.mzrdec, .mzrdec * { box-sizing: border-box; margin: 0; padding: 0; }
.mzrdec {
  font-family: 'Work Sans', sans-serif;
  color: #1D3557;
  -webkit-font-smoothing: antialiased;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  background: #FDFCFB;
  border: 1px solid #D8D3CA;
  border-radius: 12px;
  padding: 28px 32px;
  container-type: inline-size;
}
.mzrdec-grid {
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  gap: 0 28px;
}
.mzrdec-div { background: #D8D3CA; align-self: stretch; }
.mzrdec-card { display: flex; flex-direction: column; gap: 10px; }
.mzrdec-top { display: flex; align-items: center; gap: 9px; }
.mzrdec-top .mzrdec-flag { flex-shrink: 0; display: block; }
.mzrdec .mzrdec-country {
  font-family: 'Spectral', serif;
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.01em;
  color: #1D3557;
}
.mzrdec .mzrdec-rate {
  font-weight: 300;
  font-size: 26px;
  color: #1D3557;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.mzrdec .mzrdec-rate b { font-weight: 600; }
.mzrdec .mzrdec-arrow { color: #C9A77C; margin: 0 6px; font-weight: 400; font-size: 18px; }
.mzrdec .mzrdec-sub { font-size: 13px; font-weight: 400; color: #6B7A8D; line-height: 1.5; }
.mzrdec .mzrdec-badge {
  display: inline-flex; align-items: center;
  font-family: 'Work Sans', sans-serif;
  font-weight: 600; font-size: 11px; letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 6px 13px; border-radius: 20px; width: fit-content;
  margin-top: 2px;
}
.mzrdec .mzrdec-cut  { background: #EAF3EE; color: #1E7A4E; }
.mzrdec .mzrdec-hold { background: #ECEEF2; color: #1D3557; }
.mzrdec .mzrdec-hike { background: #FBECEC; color: #B91C1C; }

@container (max-width: 480px) {
  .mzrdec { padding: 22px 20px; }
  .mzrdec-grid { grid-template-columns: 1fr; gap: 20px 0; }
  .mzrdec-div { width: 100%; height: 1px; }
  .mzrdec .mzrdec-rate { font-size: 22px; }
}
</style>

<div class="mzrdec">
${inner}
</div>
`;
}

function buildOg(dados, lados) {
  const decisions = lados.map((k) => {
    const d = dados[k];
    const badge = BADGE[d.decisao];
    return `        <div class="og-decision">
          <span class="dec-label">${COUNTRY_LABEL[k]}</span>
          <span class="dec-rate">${rateHtml(d, 'arrow')}</span>
          <span class="dec-pill ${badge.ogClass}">${badge.label(d.bps)}</span>
        </div>`;
  }).join('\n');

  const dataName = `MZR-OG-Comunicado-${(dados.tituloOg || 'Comunicado').replace(/[^a-zA-Z0-9]+/g, '-')}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MZR · Open Graph Comunicado Copom/FED</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600&family=Work+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Work Sans', sans-serif; background: #EFEDE8; color: #1A2028; -webkit-font-smoothing: antialiased; padding: 32px; display: flex; flex-direction: column; align-items: center; gap: 20px; min-height: 100vh; }
  .toolbar { width: 100%; max-width: 1200px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .toolbar-info { display: flex; flex-direction: column; gap: 2px; }
  .toolbar-info .t { font-size: 15px; font-weight: 600; color: #1D3557; }
  .toolbar-info .s { font-size: 12px; color: #6B7A8D; }
  .btn-save { font-family: 'Work Sans', sans-serif; display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; color: #1D3557; background: #C9A77C; border: none; border-radius: 8px; padding: 12px 22px; cursor: pointer; transition: background .15s ease; }
  .btn-save:hover { background: #B08C58; color: #fff; }
  .btn-save:disabled { opacity: .6; cursor: progress; }
  .preview { width: 100%; max-width: 1200px; overflow: auto; border: 1px solid #D8D3CA; border-radius: 12px; background: #F7F5F2; }
  .og-card {
    position: relative; width: 1200px; height: 630px; flex-shrink: 0;
    background: #1D3557; color: #FFFFFF; overflow: hidden;
    padding: 64px 72px; display: flex; flex-direction: column; justify-content: space-between;
  }
  .og-card::after { content: ''; position: absolute; left: 0; bottom: 0; width: 100%; height: 6px; background: #C9A77C; }
  .og-head { display: flex; flex-direction: column; }
  .og-eyebrow { font-size: 23px; font-weight: 600; letter-spacing: 5px; text-transform: uppercase; color: #C9A77C; }
  .og-title { font-family: 'Spectral', serif; font-weight: 400; font-size: 96px; line-height: .98; letter-spacing: -.03em; color: #FFFFFF; margin-top: 84px; }
  .og-logo { position: absolute; top: 64px; right: 72px; display: flex; align-items: center; }
  .og-logo svg { height: 46px; width: auto; display: block; }
  .og-decisions { display: flex; border-top: 1px solid rgba(255,255,255,0.12); padding-top: 32px; }
  .og-decision { flex: 1; display: flex; flex-direction: column; gap: 16px; }
  .og-decision:first-child { padding-right: 56px; }
  .og-decision + .og-decision { border-left: 1px solid rgba(255,255,255,0.12); padding-left: 56px; }
  .dec-label { font-size: 22px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #A8B8CC; }
  .dec-rate { font-size: 44px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: #FFFFFF; line-height: 1; }
  .dec-rate .arrow { color: #C9A77C; font-weight: 500; margin: 0 .12em; }
  .dec-pill { align-self: flex-start; display: inline-flex; align-items: center; font-size: 22px; font-weight: 600; letter-spacing: .3px; padding: 9px 20px; border-radius: 999px; border: 1px solid transparent; }
  .dec-pill--corte      { color: #5CC87A; background: rgba(92,200,122,0.14);  border-color: rgba(92,200,122,0.38); }
  .dec-pill--manutencao { color: #C6D2E2; background: rgba(255,255,255,0.07);  border-color: rgba(255,255,255,0.20); }
  .dec-pill--aumento    { color: #F58A8A; background: rgba(245,138,138,0.14);  border-color: rgba(245,138,138,0.38); }
</style>
</head>
<body>

  <div class="toolbar">
    <div class="toolbar-info">
      <span class="t">Open Graph · Comunicado Copom/FED</span>
      <span class="s">Prévia 1200×630. O PNG em alta (2400×1260) é gerado automaticamente pelo publicar-mensal.mjs; o botão abaixo é só um jeito manual alternativo.</span>
    </div>
    <button class="btn-save" id="btn-save">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      Salvar PNG
    </button>
  </div>

  <div class="preview">
    <div class="og-card" id="og-card" data-name="${dataName}">
      <div class="og-logo">
        <svg viewBox="40.63 33.7 221.65 55.44" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="MZR">
          <path d="M84.23 33.70L97.33 33.70L97.33 89.14L89.02 89.14L89.02 57.05L89.69 41.76L89.60 41.76L72.72 89.14L65.24 89.14L48.36 41.76L48.28 41.76L48.95 57.05L48.95 89.14L40.63 89.14L40.63 33.70L53.99 33.70L65.16 65.79L69.02 78.98L69.19 78.98L73.14 65.79L84.23 33.70ZM156.05 41.01L119.93 84.60L118.33 81.50L157.06 81.50L157.06 89.14L112.28 89.14L112.28 81.83L148.40 38.24L150 41.34L113.04 41.34L113.04 33.70L156.05 33.70L156.05 41.01ZM171.84 33.70L194.44 33.70Q203.34 33.70 208.59 38.15Q213.84 42.60 213.84 50.16L213.84 50.16Q213.84 57.98 208.59 62.22Q203.34 66.46 194.44 66.46L194.44 66.46L193.60 66.96L180.74 66.96L180.74 89.14L171.84 89.14L171.84 33.70ZM180.74 59.49L193.76 59.49Q199.22 59.49 201.87 57.26Q204.52 55.04 204.52 50.42L204.52 50.42Q204.52 45.88 201.87 43.61Q199.22 41.34 193.76 41.34L193.76 41.34L180.74 41.34L180.74 59.49ZM191.33 64.86L199.06 61.34L217.12 89.14L206.78 89.14L191.33 64.86Z" fill="#FFFFFF"></path>
          <path d="M4,4 L27.56,18.5 L27.56,21.5 L4,36 L4,29.19 L18.93,20 L4,10.81 Z" transform="translate(226.47 35.97) scale(1.2994 1.2994)" fill="#C9A77C"></path>
        </svg>
      </div>

      <div class="og-head">
        <span class="og-eyebrow">Análises</span>
        <div class="og-title">${dados.tituloOg || ''}</div>
      </div>

      <div class="og-decisions">
${decisions}
      </div>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
  (function () {
    const btn  = document.getElementById('btn-save');
    const card = document.getElementById('og-card');
    function fileName() { return \`\${card.dataset.name || 'MZR-OG'}.png\`; }
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.textContent = 'Gerando…';
      try {
        if (document.fonts && document.fonts.ready) { await document.fonts.ready; }
        const canvas = await html2canvas(card, { scale: 2, backgroundColor: '#1D3557', useCORS: true, width: 1200, height: 630 });
        const link = document.createElement('a');
        link.download = fileName();
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (e) {
        alert('Não foi possível gerar o PNG: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  })();
  </script>
</body>
</html>
`;
}

// CLI direto: node scripts/gerar-comunicado.mjs --pasta "..."
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pasta = opt('pasta');
  if (!pasta) { console.error('Faltou --pasta'); process.exit(1); }
  const out = gerarComunicado(pasta);
  if (!out) { console.error(`Sem dados.json em ${pasta} — nada a gerar.`); process.exit(1); }
  console.log(`✓ ${out.headerPath}`);
  console.log(`✓ ${out.ogPath}`);
}
