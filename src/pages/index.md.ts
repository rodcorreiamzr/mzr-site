// /index.md — versão Markdown da Home para agentes de IA (ver middleware.js).
import { getUltimasPublicacoes } from '../lib/sanity';
import { homeMarkdown } from '../lib/agentes';

export async function GET() {
  const ultimas = await getUltimasPublicacoes(6);
  return new Response(homeMarkdown(ultimas), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
