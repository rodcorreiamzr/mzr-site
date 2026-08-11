---
name: publicar
description: Publica a Carta Mensal ou um Comunicado COPOM/FED no Sanity via scripts/publicar-mensal.mjs. Use quando o pedido for publicar/republicar/corrigir uma carta ou comunicado, fechar o conteúdo do mês, ou mexer nos scripts de publicação.
---

# Publicar Carta Mensal / Comunicado

Runbook do fluxo recorrente. Siga daqui — **não vá ler o `publicar-mensal.mjs`
inteiro** (740+ linhas) pra descobrir como rodar. Só abra o script quando for
mudar o comportamento dele.

## Antes de tudo

- **Token** só é necessário pro `--publish`. `--dry` não precisa de nada:
  ```bash
  export SANITY_TOKEN=$(npx sanity debug --secrets | grep 'Auth token' | awk '{print $3}')
  ```
- **Exit code 1 com avisos é NORMAL**, não é erro. O script sai 1 sempre que há
  qualquer aviso, de propósito (marca falha no terminal do VS Code). Erro de
  verdade aparece como `❌ ERRO`.

## Carta Mensal

O `.docx` do analista fica em `../Gerador Cartas e OG/Outputs/<ano>/<NN.mês>/`.

```bash
# 1. primeira rodada — roda o gerador Ruby e o screenshot da capa OG
node scripts/publicar-mensal.mjs --category carta \
  --titulo "Carta Mensal Agosto 2026" --data 2026-09-05 --dry

# 2. iterações seguintes — --rapido pula gerador + Chromium (dezenas de
#    segundos por rodada); nenhum dos dois muda o documento
node scripts/publicar-mensal.mjs --category carta --rapido \
  --docx ".../Outputs/2026/08.Agosto/<arquivo>.docx" \
  --titulo "Carta Mensal Agosto 2026" --data 2026-09-05 --dry

# 3. publicar (--force pra republicar por cima; é idempotente, mesmo _id)
node scripts/publicar-mensal.mjs --category carta \
  --titulo "Carta Mensal Agosto 2026" --data 2026-09-05 --publish --force
```

## Comunicado COPOM / FED

Pasta do ciclo em `../Comunicados/<data>/`, com o `.docx` e o `dados.json`
(taxas/decisões; sem ele não há card nem OG automático).

```bash
node scripts/publicar-mensal.mjs --category comunicado \
  --pasta "../Comunicados/2026-09-16" \
  --titulo "Comunicado COPOM / FED 16/09" --data 2026-09-16 --dry
```

Título e slug seguem `Comunicado COPOM / FED DD/MM` →
`comunicado-copom-fed-DD-MM`.

## Como revisar (nesta ordem)

1. **`<docx>.preview.txt`** — outline legível, uma linha por bloco. É por aqui
   que se confere estrutura, ordem dos widgets e legendas. **Leia este, não o
   `.preview.json`** (o JSON é 10× maior e diz a mesma coisa).
2. **`node scripts/conferir.mjs --preview <arquivo.preview.json> --gabarito <_id>`**
   — compara a espinha com um publicado. Gabaritos:
   - carta → `carta-carta-mensal-junho-2026`
   - comunicado → `c064e64b-aeef-42bf-be5a-cfb183311f7d` (17/06, feito à mão) ou
     `analise-comunicado-copom-fed-05-08` (primeiro publicado pelo script)
3. **Banner de avisos** — informativo. Uma carta normal fecha com ~15–16 avisos
   e está correta. Só investigar de verdade:
   - `marcador sem arquivo` / `arquivo do widget ... não tinha marcador`
   - `imagem ignorada`
   - qualquer `gerador Ruby: ✗ ...`
4. **`.preview.json`** só pra investigar um bloco específico que os passos
   acima apontaram.

## Regras que já custaram caro

- **Correção de texto vai no `.docx`, nunca no Studio.** Qualquer republicação
  sobrescreve o corpo a partir dele. Editar `.docx` = descompactar, mexer em
  `word/document.xml`, rezipar (`zip -r -X`) — o Word quebra frases em vários
  `<w:r>`, então substituir texto corrido costuma não casar; reescrever o `<w:p>`
  inteiro mantendo o `<w:pPr>` e um único run funciona. Backup com extensão
  `.bak-...` (não `.docx`, senão o script acha dois documentos e para).
- **Sempre abrir o widget do ranking no browser antes de publicar.** Ele já abriu
  vazio por um `getElementById` nulo, e nenhuma validação estrutural pega isso.
- **Republicar é barato e idempotente** (~1 min até o ar), então prefira
  republicar a corrigir à mão.
- O rodapé regulatório cita "MMZR Family Office" e "mmzrfo.com.br" **de
  propósito** — decisão do usuário de manter igual às cartas anteriores. Não é
  rebrand esquecido.

## Se for MEXER no publicar-mensal.mjs

Rode o teste de regressão antes e depois. Ele prova que a mudança não altera o
documento que vai pro Sanity, comparando os dois casos reais já publicados:

```bash
node scripts/regressao.mjs              # tem que passar antes de commitar
node scripts/regressao.mjs --atualizar  # só quando a mudança de output é intencional
```
