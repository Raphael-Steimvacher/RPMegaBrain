# RPMegaBrain

Harness pessoal local ao redor do Codex, orientado pelo blueprint v0.2.

**Versão atual: `0.2.0-alpha.1`.** A v0.2-alpha implementa o núcleo determinístico de continuidade, memória governada e recuperação seletiva. A integração real com o SDK/CLI do Codex ainda não faz parte desta entrega; o ciclo WAC v0.1 continua disponível com o motor simulado.

## Validar

Requisitos: Node.js 24+ e npm. Git melhora snapshots de repositório e `rg` acelera a pesquisa FULL; quando `rg` não existe, o adapter usa um scanner filesystem read-only.

```sh
npm ci
npm run check
npm run demo
```

`npm run check` compila TypeScript estrito, executa 56 testes, valida schemas/fixtures/skill e confere o lock de componentes. Todos os dados de estado são gravados fora do Git em `--state-dir`, `MEGABRAIN_STATE_HOME` ou no diretório de estado do sistema.

## Continuidade v0.2

Um checkpoint JSON é a autoridade; a thread é opcional. O arquivo de entrada de `run` segue `NewCheckpoint` em `src/domain/v2/contracts.ts`.

```sh
npm start -- run --profile personal --file checkpoint-input.yaml
npm start -- checkpoint list TASK-001 --profile personal
npm start -- checkpoint inspect CHECKPOINT_ID --profile personal
npm start -- checkpoint verify CHECKPOINT_ID --profile personal
npm start -- resume TASK-001 --profile personal
```

`resume` valida integridade e aprovações, detecta drift, tenta retomar a thread e cai para uma restore capsule quando necessário. A recuperação cria outro checkpoint por padrão. `--new-thread`, `--checkpoint ID`, `--accept-drift` e `--no-recovery` controlam esse fluxo. Cada criação/retomada concluída publica `run-manifest-v2.yaml`, incluindo a política de memória nativa do Codex desativada.

## Memória WARM

A unidade canônica é Markdown no estado privado do perfil. SQLite FTS5 é um índice descartável e reconstruível.

```sh
npm start -- memory propose TASK-001 --profile personal --file candidate.yaml
npm start -- memory candidates --profile personal
npm start -- memory review CANDIDATE_ID --profile personal --decision approve --expected-hash sha256:HASH
npm start -- memory search "Node runtime" --profile personal --request retrieval-request.json
npm start -- memory history MEMORY_ID --profile personal
npm start -- memory conflicts --profile personal
npm start -- memory expire --profile personal
npm start -- memory revoke MEMORY_ID --profile personal --expected-hash sha256:HASH --reason "motivo"
npm start -- memory forget MEMORY_ID --profile personal --expected-hash sha256:HASH --reason "exclusão solicitada"
npm start -- memory rebuild-index --profile personal
```

Candidatos nunca entram na busca. Aprovação humana exige o hash que foi revisado; `implement` e `--pode-fazer` não concedem aprovação de memória. Duplicatas agregam evidência, conflitos ficam em quarentena e itens expirados/revogados saem do índice ativo. A skill `memory-curator` só pode ser invocada explicitamente e apenas propõe candidatos.

## Fontes FULL e context bundle

Os templates em `core/templates/sources.*.example.yaml` usam placeholders e precisam ser copiados para uma configuração local com raízes absolutas. Fontes são read-only, separadas por perfil e filtradas por workflow, sensibilidade, include/exclude e caminho real.

```sh
npm start -- source list --profile personal --registry sources.yaml
npm start -- source doctor SOURCE_ID --profile personal --registry sources.yaml
npm start -- source search SOURCE_ID "termo" --profile personal --registry sources.yaml --workflow planning
npm start -- context build --profile personal --request retrieval-request.json --registry sources.yaml
npm start -- explain-context RUN-001 --profile personal
npm start -- trace show RUN-001 --profile personal --section retrieval
```

O pipeline filtra antes de ranquear, limita a 5 itens WARM, 8 FULL e 2 por fonte, e usa no máximo 20% do orçamento informado. Cada item carrega perfil, origem, revisão, hash, fatores de ranking e `data_not_instructions: true`. O modo `shadow` calcula e registra o conjunto sem injetá-lo.

## Compatibilidade v0.1

Os comandos WAC anteriores continuam legíveis e cobertos pelos 31 testes originais:

```sh
npm start -- wac WAC-SYNTH-001 --profile synthetic --task-file evals/fixtures/wac.json
npm start -- approve RUN_ID definition --hash sha256:HASH
npm start -- resume RUN_ID
npm start -- status RUN_ID
npm start -- trace RUN_ID
```

O `resume` v0.2 é selecionado somente quando recebe `--profile`; manifests e checkpoints v0.1 não são reescritos automaticamente.

## Limites atuais

- O adapter de thread v0.2 padrão registra indisponibilidade e usa checkpoint; ainda não chama Codex real.
- A configuração TOML em `core/templates/managed-codex-memory.toml` precisa ser aplicada pelo futuro wrapper do processo Codex. O manifest já exige os valores desativados, mas isso não prova a configuração de um processo externo.
- Policies YAML são contratos versionados e não constituem sandbox por si só.
- Busca FULL prefere `rg` e usa fallback filesystem determinístico; não há embeddings ou banco vetorial.
- Fixtures são sintéticas. Caminhos pessoais/corporativos reais ficam fora deste Git.

Veja `docs/implementation-status.md`, os runbooks em `docs/runbooks/` e as decisões ADR-020 a ADR-031.
