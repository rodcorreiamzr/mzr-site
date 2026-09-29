// /publicacoes.md — lista completa das publicações em Markdown (para agentes).
import { getPublicacoes } from '../lib/sanity';
import { linhaPublicacao, AVISO, SITE } from '../lib/agentes';

export async function GET() {
  const publicacoes = await getPublicacoes();
  const linhas = [
    '# Publicações — MZR Family Office',
    '',
    '> Cartas Mensais, análises de gestoras e FOFs e resenhas de livros. Cada item aponta para a versão Markdown; sem o `.md` no fim, é a página HTML.',
    '',
    ...publicacoes.map(linhaPublicacao),
    '',
    'Home: ' + SITE + '/index.md',
    '',
    '*' + AVISO + '*',
    '',
  ];
  return new Response(linhas.join('\n'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
