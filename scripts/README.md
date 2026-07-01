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
- `--keep-first-heading` — NÃO remove o 1º título do corpo (o padrão remove, pois o Webflow repete o título do post no início).
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
