# Taxonomia de eventos

Eventos v0.1 preservam o contrato original por run. O subsistema v0.2 grava JSONL por perfil com `schema_version: 2`, timestamp UTC, `run_id`, `task_id`, `checkpoint_id`, `profile_id` e uma allowlist curta de atributos. Texto bruto, prompts, respostas, transcript, raciocínio interno e erros completos não entram no evento.

## Continuidade

- `checkpoint.created`, `checkpoint.loaded`, `checkpoint.validation_failed`, `checkpoint.fallback_loaded`.
- `checkpoint.drift_detected`.
- `continuity.restore_capsule_built`, `continuity.thread_resumed`, `continuity.thread_resume_failed`.
- `continuity.recovered_from_checkpoint`, `continuity.user_confirmation_required`.

## Memória

- `memory.candidate_created`, `memory.approved`, `memory.rejected`, `persistence.denied`.
- `memory.duplicate_detected`, `memory.conflict_detected`.
- `memory.expired`, `memory.revoked`, `memory.deleted`.
- `memory.snapshot_created`, `memory.index_rebuilt`, `memory.index_unavailable`, `memory.selected`.
- `secret.detected`.

## Fontes e recuperação

- `source.scanned`, `source.selected`, `source.snapshot_created`, `source.unavailable`, `source.path_blocked`.
- `retrieval.started`, `retrieval.query_built`, `retrieval.completed`.
- `context.item_rejected`, `context.bundle_built`.

O `run-manifest-v2.yaml` registra `native_codex_memory.policy_reason: megabrain_managed_memory`. O futuro wrapper deve emitir `native_memory.policy_applied` somente depois de aplicar e verificar as opções no processo Codex real.

## Integrações v0.3

Eventos v0.3 usam arquivo separado, `schema_version: 3`, e a mesma regra metadata-only:

- connector: `configured`, `authentication_required`, `identity_verified`, `identity_mismatch`, `quarantined`, `revoked`;
- catálogo: `tool_catalog.locked`, `tool_catalog.drift_detected`, `tool_catalog.reviewed`;
- policy/consent: `integration.policy_decided`, `consent.granted`, `consent.revoked`;
- chamadas: `connector.call_started`, `connector.call_retried`, `connector.call_completed`;
- proveniência: `external_ref.created`, `external_ref.revalidated`, `external_ref.changed`;
- draft: `draft.intent_created`, `draft.created`.

Attributes aceitos incluem IDs, hashes, capability, decision/reason, contagens, bytes, páginas, retries e latência. Request completo, query, conteúdo, destinatário, corpo, erro bruto e credencial são descartados.

Hashes, revisões, reason codes, contagens e posições de ranking permitem explicar a seleção sem persistir o conteúdo. O context bundle guarda o trecho selecionado no estado privado porque ele é necessário para reprodução e inspeção; não é duplicado no trace.

## Candidates v0.5

Eventos de candidate são metadata-only e vinculados por `proposal_id`, `candidate_id`, `revision`, `snapshot_commit` e hashes dos artefatos. O pipeline registra, quando aplicável: `candidate.requested`, `candidate.intake_passed`, `candidate.intake_blocked`, `candidate.authorized`, `candidate.authorization_expired`, `candidate.base_resolved`, `candidate.base_drifted`, `candidate.worktree_allocated`, `candidate.worktree_locked`, `candidate.environment_preflight_completed`, `candidate.plan_frozen`, `candidate.build_started`, `candidate.file_changed`, `candidate.scope_checked`, `candidate.out_of_scope`, `candidate.regression_baseline_completed`, `candidate.regression_candidate_completed`, `candidate.snapshot_created`, `candidate.evaluation_completed`, `candidate.review_completed`, `candidate.impact_report_created`, `candidate.human_decision_recorded`, `candidate.cleanup_started`, `candidate.cleanup_completed` e `candidate.cleanup_incomplete`.

Trace não contém diff, patch, conteúdo corporativo, prompt, transcript, raciocínio, segredo, valor de variável de ambiente ou erro bruto. A decisão aceita registra somente o vínculo hash-bound ao snapshot e ao report; não representa merge ou publicação.

## Adapter de hooks do Codex

O adapter opcional de hooks registra eventos de sessão e de ferramentas em journal
privado por profile. Os eventos `SessionStart`, `PreToolUse`, `PermissionRequest`,
`PostToolUse`, `Stop`, `Interrupt` e `SessionEnd` são normalizados com IDs
pseudonimizados, sequência, timestamp, nome de ferramenta e reason code.

O envelope recebido nunca é persistido: `transcript_path`, prompt, mensagem do
assistente, `tool_input`, output, cwd absoluto, erro bruto e campos desconhecidos são
descartados antes do journal. Hooks são telemetria observacional e não são enforcement
de permissão. Ausência de `SessionEnd` produz Evidence Bundle parcial.
