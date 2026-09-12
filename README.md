# RPMegaBrain

Harness pessoal local ao redor do Codex, orientado pelo blueprint v0.5.

**Versão atual: `0.5.0`.** A v0.5 adiciona o Controlled Candidate Pipeline sobre o núcleo v0.4: intake de Proposal aprovada, autorização escopada, base SHA, worktrees baseline/candidate, Scope Guard, snapshot local, comparação, review, Impact Report e decisão humana sem merge/push. Providers reais continuam desligados e o model grader permanece desativado por padrão.

## Validar

Requisitos: Node.js 24+ e npm. Git melhora snapshots de repositório e `rg` acelera a pesquisa FULL; quando `rg` não existe, o adapter usa um scanner filesystem read-only.

```sh
npm ci
npm run check
npm run demo
```

`npm run check` compila TypeScript estrito, executa os testes v0.1–v0.5, valida schemas, fixtures, taxonomia e skill, e confere os dois locks. Todos os dados de estado são gravados fora do Git em `--state-dir`, `MEGABRAIN_STATE_HOME` ou no diretório de estado do sistema.

## Candidate Pipeline v0.5

Uma Candidate exige Proposal `approved_for_candidate`, profile explícito, repositório local, allowlist de paths e começa em `dry-run`. O modo `supervised` ainda exige autorização separada e `--pode-fazer` na ação de edição. A pipeline nunca oferece fetch, push, merge, rebase, PR, deploy ou escrita no checkout principal.

```bash
npm start -- candidate request --profile personal --proposal PROP --repo /repo --paths src/** --mode supervised
npm start -- candidate authorize CAND --profile personal --expires-in 2h
npm start -- candidate create CAND --profile personal
npm start -- candidate build CAND --profile personal --patch-file change.patch --pode-fazer
npm start -- candidate freeze CAND --profile personal
npm start -- candidate eval CAND --profile personal
npm start -- candidate review CAND --profile personal
npm start -- candidate report CAND --profile personal
```

Aceitação significa somente `AcceptedForManualIntegration`; a integração continua sendo uma operação humana fora deste pipeline.

## Avaliação v0.4

O fluxo v0.4 congela o contrato antes da avaliação, normaliza apenas metadados de trace, aplica hard gates antes de qualquer score e mantém segurança independente de feedback subjetivo:

```sh
npm start -- contract create --profile personal --file evals/fixtures/v4-contract.yaml
npm start -- contract freeze CONTRACT_ID --profile personal
npm start -- evidence build --profile personal --run RUN-V4-SYNTHETIC --contract CONTRACT_ID --file evals/fixtures/v4-evidence.yaml
npm start -- eval run --profile personal --run RUN-V4-SYNTHETIC
npm start -- eval explain EVALUATION_ID --profile personal
npm start -- diagnose run --profile personal --evaluation EVALUATION_ID
npm start -- pattern scan --profile personal
npm start -- proposal list --profile personal
```

`PASS` só ocorre quando os hard gates e requisitos obrigatórios passam. Ausência de prova produz `INCONCLUSIVE`; retries da mesma task não confirmam pattern. Proposals são drafts/revisões e `approve-for-candidate` não edita arquivos, cria branch, commit ou PR. O Evidence Bundle não guarda prompt bruto, transcript, scratchpad, segredo ou chain-of-thought.

## Integrações v0.3

O runtime usa capabilities estáveis e nega integrações por padrão. Bindings de connector não guardam tokens; catálogo, identidade, scopes, perfil, recurso, workflow, finalidade, sensibilidade, consentimento, paginação e egress são verificados antes do adapter.

```sh
npm start -- connector add fake --profile personal --file connector.yaml
npm start -- connector review-drift personal.fake.github --profile personal --provider-fixture evals/fixtures/providers/github.json
npm start -- connector verify personal.fake.github --profile personal --provider-fixture evals/fixtures/providers/github.json
npm start -- connector mode --profile personal --value shadow
npm start -- policy check --profile personal --request evals/fixtures/v3-capability-request.json
npm start -- integration call --profile personal --request request.json --provider-fixture provider.json
npm start -- external-ref inspect EXT_ID --profile personal
npm start -- consent list --profile personal
```

`shadow` decide e explica sem chamar provider. `enabled` precisa ser selecionado explicitamente. O fake provider nunca usa rede ou segredo. O fluxo de draft externo exige `mail draft external`, `mail draft approve` e `mail draft create`; o hash cobre conta, destinatários, assunto, corpo, fontes e a lista vazia de anexos. Não existe comando `mail send`.

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

- GitHub, GitLab, Jira, Gmail e Google Drive possuem contratos e fixtures offline, não adapters autenticados de produção. `connector login` deliberadamente não simula OAuth.
- A integração FULL externa retorna envelopes `untrusted_content` e external refs; ela ainda não é injetada automaticamente no context bundle v0.2 nem iniciada pelo router/modelo.
- O catálogo v0.3 contém os 37 casos normativos; 15 testes agrupados exercitam o gateway e os cenários críticos. Validação operacional contra providers reais permanece pendente.
- O adapter de thread v0.2 padrão registra indisponibilidade e usa checkpoint; ainda não chama Codex real.
- A configuração TOML em `core/templates/managed-codex-memory.toml` precisa ser aplicada pelo futuro wrapper do processo Codex. O manifest já exige os valores desativados, mas isso não prova a configuração de um processo externo.
- Policies YAML são contratos versionados e não constituem sandbox por si só.
- Busca FULL prefere `rg` e usa fallback filesystem determinístico; não há embeddings ou banco vetorial.
- Fixtures são sintéticas. Caminhos pessoais/corporativos reais ficam fora deste Git.

Veja `docs/implementation-status.md`, o threat model e os runbooks em `docs/runbooks/`, e as decisões ADR-032 a ADR-047.
