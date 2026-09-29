// /404.md — corpo Markdown do "não encontrado". O middleware.js o devolve com
// status 404 quando um agente pede Accept: text/markdown numa URL inexistente.
import { naoEncontradoMarkdown } from '../lib/agentes';

export async function GET() {
  return new Response(naoEncontradoMarkdown(), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
