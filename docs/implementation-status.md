# Estado da implementação

Data: 12/09/2026. Versão: 0.5.0.

O blueprint v0.5 está implementado como pipeline local controlado sobre a v0.4. O fluxo mantém o checkout principal intocado, usa estado fora do Git, não fornece operações remotas e não declara sandbox completa, integração Codex/MCP ou execução de modelo real.

| Marco v0.5 | Estado | Evidência |
|---|---|---|
| Intake e autorização | Implementado | `src/application/candidates/service.ts`, Proposal aprovada, base SHA, expiração e `--pode-fazer` |
| Workspaces e ambiente | Núcleo implementado | baseline/candidate worktrees, branch sem upstream, lock, manifest de ambiente e bloqueio de submodules |
| Change Plan e Scope Guard | Implementado | allowlist, untracked, renames, budget, symlink, binário, paths sensíveis e lockfiles |
| Snapshot e comparação | Núcleo implementado | commit local, tree/hash, execução baseline/candidate e classificação de regressão |
| Review, Impact Report e decisão | Implementado | review read-only, report hash-bound, decisões append-only e ausência de merge/push |
| Cleanup e recovery | Núcleo implementado | remoção exata sem force, branch preservada e receipt |

O blueprint v0.5 é a referência vigente. Esta entrega implementa o loop local e controlado de avaliação/candidate; não declara conexão real com providers, Codex/MCP, sandbox completa do agente ou qualidade de resposta de modelo.

| Marco v0.4 | Estado | Evidência |
|---|---|---|
| 0 — schemas, taxonomia e compatibilidade | Implementado | `core/schemas/v4/`, `core/taxonomy/failures-v1.yaml`, validação estrita |
| 1 — Task Contract | Implementado | builder, freeze por hash, revisão versionada e `post_hoc` |
| 2 — Evidence Bundle | Implementado | normalização de eventos, redaction, gaps, hash e isolamento por profile |
| 3 — Deterministic Evaluators | Implementado | integridade, profile/policy, validade de verificações, cobertura e agregação hard-first |
| 4 — feedback humano | Núcleo implementado | annotations, correção/aceite/discordância persistidos por profile |
| 5 — model grader | Desativado por padrão | catálogo/contratos preparados; nenhuma chamada de modelo é necessária |
| 6 — Trace Analyzer | Núcleo implementado | primeira divergência observável, hipóteses, contraevidência, UNKNOWN e próxima evidência |
| 7 — Pattern Miner | Núcleo implementado | fingerprint, independência por task, threshold 3 e caminho urgente |
| 8 — Improvement Proposals | Núcleo implementado | alvo único, regressões, rollback, revisão humana e ausência de `apply` |
| 9 — suites/experimentos | Esqueleto local | suites declaradas, comparação de avaliações e plano sem candidate automático |
| 10 — hardening | Em evolução | testes sintéticos v0.4 passam; calibração humana/model grader, OTel e casos holdout reais pendentes |

| Marco v0.3 | Estado | Evidência |
|---|---|---|
| 0 — ADRs, schemas e threat model | Implementado | ADR-032 a ADR-047, 10 schemas, 5 policies, 4 catálogos e threat model |
| 1 — Fake provider | Implementado | adapter determinístico intercambiável, erros 401/403/429/5xx, conteúdo hostil e draft idempotente |
| 2 — Policy Gateway | Implementado | default deny, 16 checks, reason codes, limits e explain persistido |
| 3 — Registry e Credential Boundary | Núcleo implementado | stores por perfil, secret refs opacos, fingerprints, scopes exatos, lifecycle, quarantine e receipts; OAuth/keyring reais pendentes |
| 4–7 — SCM/Jira/Drive/Gmail read | Contratos offline | ports/capabilities normalizados e fixtures; adapters reais e autorização operacional pendentes |
| 8 — Draft beta | Implementado somente no fake | intent local/externo, payload hash, approval por chamada, idempotência e ausência de send |
| 9 — Evals e release | Alpha validada | catálogo dos 37 casos; 15 testes v0.3 agrupados; testes reais de provider/OTel pendentes |

O manifest v3 registra snapshot de connectors, capabilities, receipts, external refs e writes sem corpo bruto. External refs são persistidas em `reference_only`; o conteúdo entregue ao caller é marcado como não confiável e não vira WARM.

| Marco v0.2 | Estado | Evidência |
|---|---|---|
| 0 — ADRs e schemas | Implementado | ADR-020 a ADR-031, 8 schemas estritos, policies e fixtures |
| 1 — Checkpoints | Implementado | store imutável, encadeamento, hash, `current`, list/inspect/verify e corrupção testada |
| 2 — Continuity Manager | Núcleo implementado | restore capsule, thread opcional, fallback, recovery checkpoint e drift; `CodexEngine` App Server para retomada Teach/read-only |
| 3 — WARM canônica | Implementado | candidatos, revisão humana por hash, Markdown, revisões, lifecycle, locks, exclusão e FTS5 reconstruível |
| 4 — Retrieval WARM | Implementado | filtros, ranking determinístico, orçamento, snapshot, context bundle e explain-context |
| 5 — FULL | Implementado para filesystem/Git local | registry, `rg` com fallback filesystem, provenance, snapshots, doctor, include/exclude e bloqueio de symlink externo |
| 6 — Curadoria | Implementado | skill explicit-only, propostas pendentes, duplicatas, conflitos, expiração, revogação e histórico |
| 7 — Release | Alpha validada | 24 casos catalogados; 56 testes de software passam; baseline de modelo e RC final pendentes |

Os 31 testes v0.1 e os 26 testes v0.2/continuidade continuam passando. Os 15 testes v0.3 cobrem registry/profile, identity/tenant/scope, seleção ambígua, default deny, shadow/disabled, catalog drift, minimização, paginação, output guard, trace privado, consentimento R2, draft por hash e idempotência, hard deny de send/anexos, auth sem fallback, revalidação, purge e schemas. O catálogo de 37 casos também inclui cenários que ainda precisam de contract tests por provider e avaliações completas de modelo; teste determinístico não mede qualidade do Codex.

## Implementado com enforcement local

- Estado, cache e eventos separados fisicamente por perfil.
- Checkpoint como autoridade e thread como otimização.
- Aprovação humana pelo hash exato antes de ativar memória.
- Fontes FULL read-only com raiz absoluta, path containment e provenance.
- Conteúdo recuperado marcado como dado e incapaz de mudar policy no pipeline.
- Manifest v2 com versões de contrato e memória nativa declarada como desativada.
- Bloqueio defensivo de padrões comuns de segredo antes de persistir candidato/checkpoint.

## Trabalho restante para a v0.3 final

- Implementar e auditar transports reais de GitHub/GitLab/Jira/Drive/Gmail atrás dos ports, somente em ambientes autorizados.
- Integrar envelopes externos ao router e ao context bundle com budget/ranking combinado e checkpoint automático.
- Aplicar allowlist/approval/output limits no host MCP/Codex e comparar o catálogo descoberto com `integrations.lock.yaml`.
- Implementar OAuth/keyring host-managed sem materializar tokens no processo do modelo.
- Executar os 37 casos como contract tests individuais, medir métricas e adicionar export OTel sem conteúdo.
- Validar privacy purge também contra cache/host/provider e testar circuit breaker/Retry-After com relógio controlado.
- Ampliar o `CodexEngine` além de retomadas Teach/read-only (execução supervisionada continua no Candidate Pipeline) e validar contra uma versão instalada do Codex antes de cada release.
- Comprovar sandbox/capabilities contra a versão instalada do Codex.
- Adicionar resolução guiada de conflitos; nesta alpha conflitos ficam em quarentena e exigem nova curadoria/revogação.
- Medir baseline e metas de Precision@5, recall crítico, uso de contexto, latência e tokens com execuções de modelo.
- Validar operacionalmente Linux, backup/restore e durabilidade contra queda de energia.
- Rodar cenários reais sanitizados antes de promover a RC.

Os overlays, contas, tenants, endpoints e credenciais reais `personal` e `work.colmeia` continuam fora do repositório. O template corporativo começa vazio e disabled.
