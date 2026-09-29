// /llms.txt — guia do site para agentes de IA (formato https://llmstxt.org).
import { getPublicacoes } from '../lib/sanity';
import { llmsTxt } from '../lib/agentes';

export async function GET() {
  const publicacoes = await getPublicacoes();
  return new Response(llmsTxt(publicacoes), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
