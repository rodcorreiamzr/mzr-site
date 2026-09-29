// /publicacoes/<slug>.md — cada publicação em Markdown (para agentes).
import { getPublicacoes, getPublicacaoBySlug } from '../../lib/sanity';
import { portableTextToMarkdown } from '../../lib/markdown';
import { rotuloTag, SITE } from '../../lib/agentes';

export async function getStaticPaths() {
  const publicacoes = await getPublicacoes();
  return publicacoes.map((p: any) => ({ params: { slug: p.slug } }));
}

export async function GET({ params }: { params: { slug: string } }) {
  const pub = await getPublicacaoBySlug(params.slug);
  const urlHtml = SITE + '/publicacoes/' + params.slug;
  const md = [
    '# ' + pub.titulo,
    '',
    rotuloTag(pub.tag) + ' · ' + pub.data + ' · MZR Family Office · ' + urlHtml,
    '',
    portableTextToMarkdown(pub.corpo, urlHtml),
  ].join('\n');
  return new Response(md, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
