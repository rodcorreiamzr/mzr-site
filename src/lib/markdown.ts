// Portable Text (corpo das publicações no Sanity) → Markdown, para as versões
// .md servidas a agentes. Cobre o que o schema `publicacao` permite: estilos
// normal/h2/h3/blockquote/legenda/regulatorio, listas, negrito, itálico, link,
// imagem e código embutido (gráficos interativos não viram Markdown — o texto
// aponta para a versão HTML).

function textoSpans(block: any): string {
  const links: Record<string, string> = {};
  for (const d of block.markDefs || []) {
    if (d._type === 'link' && d.href) links[d._key] = d.href;
  }
  // Marcas viram delimitadores Markdown abertos/fechados só quando mudam de um
  // span para o outro (o Sanity quebra um mesmo trecho em vários spans).
  // Pilha: fechar uma marca obriga a fechar as que foram abertas depois dela.
  const abre = (m: string) => (m === 'strong' ? '**' : m === 'em' ? '_' : '[');
  const fecha = (m: string) => (m === 'strong' ? '**' : m === 'em' ? '_' : '](' + links[m] + ')');
  const conhecida = (m: string) => m === 'strong' || m === 'em' || !!links[m];

  let out = '';
  const pilha: string[] = [];
  // Delimitadores de fechamento ficam colados no texto, antes de espaços finais.
  const fechar = (m: string) => {
    const espaco = out.match(/\s*$/)![0];
    out = out.slice(0, out.length - espaco.length) + fecha(m) + espaco;
  };

  for (const span of block.children || []) {
    // Tira caracteres invisíveis (zero-width, herança do Webflow) que quebram links.
    const texto: string = (span.text || '').replace(/[\u200b-\u200d\ufeff]/g, '');
    if (!texto) continue;
    const marcas: string[] = texto.trim() ? (span.marks || []).filter(conhecida) : pilha.slice();
    // Fecha do topo até a marca mais funda que não continua neste span.
    const primeiraQueSai = pilha.findIndex((m) => !marcas.includes(m));
    if (primeiraQueSai >= 0) {
      while (pilha.length > primeiraQueSai) fechar(pilha.pop()!);
    }
    const [, antes, resto] = texto.match(/^(\s*)([\s\S]*)$/)!;
    out += antes;
    for (const m of marcas) {
      if (!pilha.includes(m)) { out += abre(m); pilha.push(m); }
    }
    out += resto;
  }
  while (pilha.length) fechar(pilha.pop()!);
  return out;
}

function imagem(value: any): string {
  const src = value?.assetUrl;
  if (!src) return '';
  const legenda = (value?.legenda || '').trim();
  return '![' + legenda.replace(/[\[\]]/g, '') + '](' + src + ')' + (legenda ? '\n\n*' + legenda + '*' : '');
}

function codigoEmbutido(value: any, urlHtml: string): string {
  const codigo: string = value?.codigo || '';
  const iframe = codigo.match(/<iframe[^>]+src="([^"]+)"/i);
  if (iframe && !/<script/i.test(codigo)) return '[Conteúdo incorporado](' + iframe[1] + ')';
  return '*[Gráfico interativo — ver na versão HTML: ' + urlHtml + ']*';
}

export function portableTextToMarkdown(corpo: any[], urlHtml: string): string {
  if (!Array.isArray(corpo)) return '';
  const partes: string[] = [];
  let lista: string[] = [];
  let numero = 0;
  let tipoLista = '';

  const fecharLista = () => {
    if (lista.length) partes.push(lista.join('\n'));
    lista = [];
    numero = 0;
    tipoLista = '';
  };

  for (const b of corpo) {
    if (b._type === 'block' && b.listItem) {
      if (tipoLista && tipoLista !== b.listItem) fecharLista();
      tipoLista = b.listItem;
      const recuo = '  '.repeat(Math.max(0, (b.level || 1) - 1));
      const marcador = b.listItem === 'number' ? ++numero + '.' : '-';
      lista.push(recuo + marcador + ' ' + textoSpans(b).trim());
      continue;
    }
    fecharLista();

    if (b._type === 'image') {
      const md = imagem(b);
      if (md) partes.push(md);
      continue;
    }
    if (b._type === 'codigoEmbutido') {
      partes.push(codigoEmbutido(b, urlHtml));
      continue;
    }
    if (b._type !== 'block') continue;

    let texto = textoSpans(b).trim();
    if (!texto) continue;
    // Título inteiro em negrito: o "#" já dá o destaque.
    if (/^h\d$/.test(b.style)) texto = texto.replace(/^\*\*([^*]+)\*\*$/, '$1');
    switch (b.style) {
      case 'h2': partes.push('## ' + texto); break;
      case 'h3': partes.push('### ' + texto); break;
      case 'h4': partes.push('#### ' + texto); break;
      case 'blockquote': partes.push(texto.split('\n').map((l) => '> ' + l).join('\n')); break;
      case 'legenda': partes.push('*' + texto + '*'); break;
      case 'regulatorio': partes.push('<small>' + texto + '</small>'); break;
      default: partes.push(texto);
    }
  }
  fecharLista();
  return partes.join('\n\n') + '\n';
}
