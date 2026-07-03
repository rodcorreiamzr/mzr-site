# MZR Family Office — Site Institucional (projeto ativo)

Site em produção: **https://mzrfo.com.br** — Astro (SSG estático) + Sanity CMS. Este é o único projeto de site que se edita; qualquer outra pasta de site na árvore (`Sites Antigos/`) é referência morta.

## Infraestrutura
- **GitHub:** https://github.com/rodcorreiamzr/mzr-site (conta `rodcorreiamzr`)
- **Vercel:** deploy automático — `.git/hooks/post-commit` faz `git push` + `curl` no deploy hook da Vercel a cada commit local (~1min pra ir ao ar)
- **Sanity Studio:** https://mzrfo.sanity.studio (login: rodrigo.correia@mzrinvestimentos.com.br) — project ID `xe11jg20`, dataset `production`
- **Sanity → Vercel:** webhook "Vercel Deploy" dispara rebuild ao publicar conteúdo. Filtro atual: `_type in ["publicacao","fundoDocumentos","prestacaoContas","documentosRegulatorio"]`. **Ao criar um tipo de documento novo, adicionar ao filtro** (https://www.sanity.io/manage/project/xe11jg20/api/webhooks), senão publicar aquele tipo não atualiza o site.
- Domínio: `mzrfo.com.br` é canônico (non-www); `www`/`.com` fazem 308 → ele (configurado na Vercel, não em código)

## Fluxo de atualização
- **Código/layout:** editar → `git commit` → push + deploy automático via hook
- **Conteúdo:** cadastrar no Sanity Studio → publicar → webhook dispara rebuild automático

## Estrutura
```
src/
├── layouts/Base.astro       ← navbar + footer + CSS global (is:global) + modal regulatório
├── pages/
│   ├── index.astro          ← Home completa (hero, serviços, diferenciais, fundos, contato)
│   ├── publicacoes/
│   │   ├── index.astro      ← listagem com filtros + paginação 30/pág
│   │   └── [slug].astro     ← interna (rich text do Sanity + TOC + sticky bar)
│   └── prestacao-de-contas/index.astro  ← página singleton (Ciclo Olímpico)
├── lib/sanity.ts            ← getPublicacoes, getFundoDocumentos, getDocumentosRegulatorio, getPrestacaoContas
└── sanity/schemaTypes/      ← schemas do Studio
scripts/
├── migrar.mjs                ← migrador genérico CSV(Webflow)→Sanity (ver "Migração de conteúdo" abaixo)
└── lib/convert.mjs           ← conversor HTML→Portable Text usado pelo migrador
```

## Gotchas importantes (já mordido por isso)
- **`useCdn:false` em `lib/sanity.ts`** — obrigatório. Com `useCdn:true` o build lia CDN defasado logo após publicar e deployava conteúdo antigo.
- **Estilo sobre rich text do Sanity (`set:html`)** precisa de `:global()` no seletor descendente. O Astro anexa o atributo de escopo só no último elemento do seletor — `.container img` sem `:global()` nunca bate no `<img>` vindo do CMS (sem esse atributo).
- **`<script>` injetado via `set:html` não executa** (segurança do browser). Widgets interativos do CMS (gráficos, embeds) precisam ser `<iframe srcdoc>`, não `<script>` inline.
- **Template literal começando com `<` em arrow function no frontmatter** (`(p) => \`<p>...\``) faz o esbuild confundir com JSX e quebra o build com erro apontando pro arquivo errado. Usar concatenação de string (`'<p>' + x + '</p>'`) em componentes novos do `toHTML`.
- **`is:inline` não enxerga variáveis server-side.** Para passar dado do frontmatter pro JS legado (`is:inline`), usar um `<script define:vars={{...}}>` separado antes, que seta em `window`.
- Documentos Sanity "singleton" (`prestacaoContas`, `documentosRegulatorio`) — manter só 1 registro publicado; a query sempre pega `[0]`.

## Pendências atuais
- **Formulário de contato** (`index.astro`, seção `#contato`) — hoje é `onsubmit="return false"`, sem `name`/`action`. Decidido: **Web3Forms** (grátis, sem backend — site é `output:'static'`). Implementar: `access_key` público + fetch POST pra `https://api.web3forms.com/submit` + honeypot anti-spam.
- **Script de publicação recorrente** (Carta Mensal + Comunicados + Livros) — hoje só existe `scripts/migrar.mjs`, que é o migrador **one-off** do histórico Webflow (roda a partir de CSV). Falta um script separado pro fluxo mensal: analista atualiza a planilha → gera HTML em `Sites/Gerador Cartas e OG/` (ver abaixo) → esse script pega o HTML/dados e publica no Sanity. Reaproveitar `scripts/lib/convert.mjs`. Categoria "Comunicados" pode precisar de tag nova no schema `publicacao` (hoje: Cartas Mensais | Analises | Livros | Gestoras | FOFs).
- Avaliar se 8px do estilo "Texto regulatório" está legível o suficiente.

## Pastas irmãs relevantes (fora deste repo git)
- **`Sites/Gerador Cartas e OG/`** — app Python/Ruby (roda local via `.command`/`.bat`) que gera os HTMLs da Carta Mensal e das imagens Open Graph a partir de uma planilha (`Dados Carta Mensal.gsheet`) que os analistas atualizam. Output relevante para o script de publicação pendente acima — os HTMLs gerados ali (`Outputs/<ano>/<mês>/`) serão a fonte de dados/layout que o script de publicação vai consumir. Não é código do site, não versionar junto.
- **`Sites/Migracao Conteudo/`** — CSVs exportados do Webflow (cartas, livros, análises, FOFs, gestoras) usados pelo `scripts/migrar.mjs` durante a migração histórica. Guardado caso precise reprocessar algo; não faz parte do fluxo normal.
- **`Sites/Sites Antigos/`** — arquivo morto (site HTML single-file pré-Astro + sites ainda mais antigos). Só referência, não editar.

## Migração de conteúdo (histórico, encerrada 2026-07-02)
309 publicações do Webflow foram avaliadas; usuário decidiu portar 180 (Cartas Mensais 59, Livros 24, Gestoras 53, Análises 11, FOFs 33) e não completar o restante. Só retoma se aparecer um CSV novo. Uso do migrador: `scripts/README.md`.

## Dados institucionais
- Empresa: MZR GESTORA DE RECURSOS LTDA — CNPJ 39.667.665/0001-99
- Tel/WhatsApp: (11) 93620-1241 → `wa.me/5511936201241`
- Email: contato@mzrfo.com.br
- Endereço: Rua Joaquim Floriano, 820 — 20º Andar — São Paulo/SP

## Comandos úteis
```bash
npm run dev                          # dev server local
npx sanity deploy                    # deploy do Studio (após mudar schema)
npx sanity login --provider sanity   # login se necessário

# migrador de conteúdo (histórico)
export SANITY_TOKEN=$(npx sanity debug --secrets | grep 'Auth token' | awk '{print $3}')
node scripts/migrar.mjs --csv "/caminho/x.csv" --category cartas --dry
node scripts/migrar.mjs --csv "/caminho/x.csv" --category cartas --publish
```
