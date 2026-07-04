# Publicação mensal (Carta Mensal / Comunicados)

Publica no Sanity (`publicacao`) o fluxo **recorrente**: Carta Mensal (todo
mês) e Comunicados Copom/FED (a cada ciclo de decisão). Não confundir com o
migrador Webflow (seção abaixo), que é o histórico one-off.

## Setup (uma vez)

Deps já instaladas como devDependencies: `mammoth` (conversão `.docx`→HTML),
`puppeteer` (Chromium headless, baixado automaticamente no `npm install`,
usado só pra tirar o screenshot da capa OG). Token do Sanity: mesmo comando da
seção de migração, abaixo.

## Carta Mensal — fluxo de 1 comando

1. O analista escreve a carta em Word a partir do modelo
   `scripts/templates/carta-mensal-modelo.docx` — mesma estrutura de seções
   de todo mês, com os marcadores `[[TABELA:...]]` já no lugar certo (não
   mexer neles, só escrever o texto ao redor). Seção "RETORNO ABSOLUTO" é
   opcional — apagar (título + marcador) se não houver naquele mês.
2. Salva o `.docx` dentro de `Sites/Gerador Cartas e OG/Outputs/<ano>/<mês>/`
   — essas pastas já estão pré-criadas com prefixo numérico pra ordenar certo
   no Finder (`04.Abril`, `05.Maio`, ..., `12.Dezembro`) pro resto de 2026 e
   todo 2027, então dá pra deixar o arquivo lá antes mesmo do gerador rodar
   pra aquele mês. O `gerar_outputs.rb` não conhece esse prefixo — sempre
   escreve numa pasta com o nome puro do mês (`Abril`, sem número).
   `publicar-mensal.mjs` detecta isso sozinho: se já existir uma pasta
   numerada pro mês, ele move o que o Ruby acabou de gerar pra dentro dela
   (onde o `.docx` já está) antes de continuar — não precisa fazer nada manual.
3. Se alguém for gerar o widget de **Retorno Absoluto** (`Ranking_Anual_
   Multimercado.html`), o arquivo vai na mesma pasta.
4. Rodar:

```bash
export SANITY_TOKEN=$(npx sanity debug --secrets | grep 'Auth token' | awk '{print $3}')
node scripts/publicar-mensal.mjs --category carta \
  --titulo "Carta Mensal Junho 2026" --data 2026-07-06 --dry
```

Isso já: roda o gerador Ruby (lê a planilha, cria as 4 tabelas + template OG
no `Outputs/<ano>/<mês>/`), tira o screenshot da capa OG em alta resolução
(Puppeteer, 2400×1260), acha o `.docx` sozinho na pasta, converte pra
Portable Text e substitui os marcadores pelos widgets. Confira o relatório
(blocos, imagens, avisos de marcador/arquivo) e o `<docx>.preview.json`
gerado ao lado do `.docx`. Se estiver tudo certo, repita com `--publish`.

## Comunicados Copom/FED — fluxo de 1 comando

1. Pastas já pré-criadas em `Sites/Comunicados/<data>/` (ex.:
   `Sites/Comunicados/2026-08-05/`) — uma por ciclo de decisão Copom/FOMC,
   resto de 2026 + todo 2027, com base no calendário oficial dos dois bancos
   centrais. É ali que entra o `.docx` (e o `dados.json`, se houver decisão
   de juros) quando o comunicado daquele ciclo for escrito.
2. Nessa pasta, criar `dados.json` com as taxas/decisões de cada comitê (ver
   schema em `scripts/gerar-comunicado.mjs`) e o `.docx` a partir do modelo
   `scripts/templates/comunicado-copom-fed-modelo.docx` (apagar a seção do
   país que não se aplica, se for só COPOM ou só FED naquele ciclo).
3. Rodar:

```bash
node scripts/publicar-mensal.mjs --category comunicado \
  --pasta "../Comunicados/2026-08-05" \
  --titulo "Comunicado COPOM / FED 05/08" --data 2026-08-05 --dry
```

Isso gera `header.html`/`og.html` a partir do `dados.json` (card com 1 ou 2
colunas, dependendo de quantos comitês estão `"presente": true`), tira o
screenshot da capa OG, acha o `.docx`, converte e substitui o marcador
`[[TABELA:header]]`. Comunicados sem decisão de juros (artigos avulsos) não
precisam de `dados.json` — só o `.docx`, sem header nem OG automático.

## Flags (`publicar-mensal.mjs`)

- `--category carta|comunicado` (obrigatório).
- `--dry` / `--publish` — obrigatório escolher um.
- `--titulo "..."` / `--data YYYY-MM-DD` — obrigatórios, sem inferência.
- `--pasta <caminho>` — obrigatório só pra `comunicado`.
- `--docx <caminho>` — opcional; se omitido, acha o único `.docx` na pasta.
- `--force` — regrava se já existir (senão pula).
- `--pular-gerador` — não roda o gerador Ruby / gerador de comunicado de novo
  (reaproveita o que já tem na pasta; útil pra iterar rápido no `--dry`).
- `--pular-og` — não tira screenshot da capa.
- `--og <caminho-imagem>` — sobrescreve a capa com uma imagem específica.
- `--keep-first-heading` / `--strip-first-heading` — default mantém (o texto
  novo não repete o título como heading).

## Marcadores `[[TABELA:...]]`

Ficam em parágrafos isolados no `.docx`, no ponto exato onde a tabela deve
aparecer. Chaves reconhecidas:

| categoria    | chave            | arquivo esperado na pasta                  |
|--------------|------------------|---------------------------------------------|
| `carta`      | `indicadores`    | `mmzr_tabela_indicadores_*.html`             |
| `carta`      | `posicionamento` | `mmzr_tabela_posicionamento_*.html`          |
| `carta`      | `mercado`        | `mmzr_indicadores_mercado_*.html`            |
| `carta`      | `rentabilidades` | `mmzr_tabela_rentabilidades_*.html`          |
| `carta`      | `ranking`        | `Ranking_Anual_Multimercado.html` (opcional) |
| `comunicado` | `header`         | `header.html` (gerado do `dados.json`)       |

Marcador sem arquivo correspondente → bloco removido + aviso no relatório
(nunca vaza `[[TABELA:...]]` literal pro ar). Arquivo encontrado mas sem
marcador usado no texto → anexado ao final do corpo + aviso (rede de
segurança — nada se perde).

---

# Migrador Webflow → Sanity

Migra publicações exportadas do CMS do Webflow (CSV) para o Sanity (`publicacao`).
Genérico por categoria. Não afeta o build do site (fica fora de `src/`).

## Setup (uma vez)

Deps já instaladas como devDependencies: `jsdom`, `papaparse`, `@sanity/client`.

Pegue o token do Sanity (usa o login já ativo do CLI):

```bash
cd Sites/mzr-site
export SANITY_TOKEN=$(npx sanity debug --secrets | grep 'Auth token' | awk '{print $3}')
```

## Fluxo recomendado: dry-run → revisar → publicar

1. **Dry-run** (não grava nada; gera preview + diagnóstico):

```bash
node scripts/migrar.mjs --csv "/caminho/Blog posts Cartas.csv" --category cartas --dry
```

Confira no terminal: títulos, slugs, datas, contagem de blocos/imagens e a
seção **⚠ ATENÇÃO** (itens com iframe/table/script). Abra os arquivos gerados
ao lado do CSV: `*.preview.json` (todos os docs) e `*.amostra.txt` (1º item legível).

2. **Publicar** (grava no Sanity, em 1 transação; dispara rebuild no Vercel):

```bash
node scripts/migrar.mjs --csv "/caminho/Blog posts Cartas.csv" --category cartas --publish
```

## Categorias

| `--category` | tag no schema     | prefixo removido do título | `_id`        |
|--------------|-------------------|----------------------------|--------------|
| `livros`     | `Livros`          | `Livro:`                   | `livro-<slug>`   |
| `cartas`     | `Cartas Mensais`  | `Carta...:`                | `carta-<slug>`   |
| `analises`   | `Analises`        | `Análise...:`              | `analise-<slug>` |

## Flags úteis

- `--dry` / `--publish` — obrigatório escolher um.
- `--force` — regrava itens que já existem (senão são pulados; migração é idempotente).
- `--keep-first-heading` / `--strip-first-heading` — força manter/remover o 1º heading do corpo. Padrão vem do preset da categoria: `livros` remove (Webflow repete o título), `cartas` mantém (começa numa seção real). Os níveis de heading são normalizados: o mais raso presente vira **H2** (gera o índice/TOC), os demais viram H3.
- `--img-width N` — define a largura (%) de TODAS as imagens do lote (ex.: `--img-width 20` p/ capas de livro, centralizadas). Vazio = largura total. No CMS dá para ajustar cada imagem depois (campo "Largura (%)").
- Overrides de coluna, se um CSV vier diferente: `--name-col`, `--body-col`, `--date-col`.
- Overrides manuais: `--tag "..."`, `--id-prefix "..."`, `--strip-prefix "regex"`.

## O que o conversor faz (HTML → Portable Text)

- Remove o 1º heading (título repetido) e parágrafos vazios (zero-width do Webflow).
- `strong/b`→negrito, `em/i`→itálico, `a`→link, `blockquote`→citação, `br`→quebra.
- `h1/h2`→H2, `h3..h6`→H3. `ul/ol/li`→listas (bullet/number, com nível).
- `figure>img`/`img`→imagem (baixa do Webflow e re-upload como asset; Sanity deduplica por hash).
- `iframe`/`table`→bloco `codigoEmbutido` (HTML cru). `script`→ignorado (não executa via set:html; use iframe).
- **Diagnóstico** aponta tags incomuns por lote — a 1ª rodada de cada categoria nova deve ser revisada.

## Notas

- Slugs são gerados do título limpo e deduplificados globalmente (sufixo `-2`, `-3`).
- `_id` determinístico (`<prefixo><slug>`) → re-rodar é idempotente (mesmo item = mesmo doc).
- Citação com autor: `<br>` vira `\n`, mas o renderer não converte em quebra visual (autor fica na mesma linha). Cosmético.
