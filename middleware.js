// Vercel Routing Middleware — negociação de conteúdo para agentes de IA.
//
// Quem pede `Accept: text/markdown` numa página recebe a versão Markdown
// gerada no build (<caminho>.md; a Home é /index.md) com Vary: Accept.
// URL inexistente → /404.md com status 404. Qualquer outro pedido (navegador,
// Google, etc.) passa direto e recebe o HTML de sempre.
//
// Falha sempre para o lado seguro: qualquer erro aqui só devolve o HTML normal.

// Redirects do vercel.json: não mexer, o agente deve seguir o 302.
const REDIRECTS = ['/spotify', '/instagram', '/estagio', '/linkedin'];

const MD_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Vary': 'Accept',
  'Cache-Control': 'public, max-age=0, must-revalidate',
};

export const config = {
  // Só páginas: ignora arquivos com extensão (.md, .jpg, .js, ...) e assets do Astro.
  matcher: ['/((?!_astro/|.*\\.[a-zA-Z0-9]+$).*)'],
};

// q-value de um tipo no cabeçalho Accept (0 se ausente).
function qualidade(accept, tipo) {
  let melhor = 0;
  for (const parte of accept.split(',')) {
    const [midia, ...params] = parte.trim().toLowerCase().split(';');
    if (midia.trim() !== tipo) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    melhor = Math.max(melhor, q ? parseFloat(q.slice(2)) || 0 : 1);
  }
  return melhor;
}

export function querMarkdown(accept) {
  const md = qualidade(accept, 'text/markdown');
  return md > 0 && md >= qualidade(accept, 'text/html');
}

export default async function middleware(request) {
  const accept = request.headers.get('accept') || '';
  if (!querMarkdown(accept)) return;

  const url = new URL(request.url);
  const caminho = url.pathname.replace(/\/+$/, '');
  if (REDIRECTS.includes(caminho)) return;

  try {
    const md = await fetch(new URL((caminho || '/index') + '.md', url.origin));
    if (md.ok) return new Response(await md.text(), { status: 200, headers: MD_HEADERS });

    // Sem versão .md: se a página HTML existe, entrega o HTML normalmente.
    const html = await fetch(url, { method: 'HEAD', headers: { accept: 'text/html' }, redirect: 'manual' });
    if (html.status !== 404) return;

    const nf = await fetch(new URL('/404.md', url.origin));
    return new Response(await nf.text(), { status: 404, headers: MD_HEADERS });
  } catch {
    return;
  }
}
