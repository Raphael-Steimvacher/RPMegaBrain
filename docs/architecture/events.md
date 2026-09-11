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
