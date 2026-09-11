import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('core/schemas');
mkdirSync(root, { recursive: true });
const str = (maxLength = 100000) => ({ type: 'string', minLength: 1, maxLength });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const arr = (items, extra = {}) => ({ type: 'array', items, ...extra });
const obj = (properties, optional = []) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties).filter(k => !optional.includes(k)) });
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$' };
const digest = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' };
const date = { type: 'string', format: 'date-time' };
const en = values => ({ type: 'string', enum: values });
const sensitivity = en(['public','personal','confidential']);
const confidence = en(['tentative','supported','confirmed']);
const memoryKind = en(['decision','correction','preference','convention','verified_fact','pattern']);
const validity = en(['static','release_bound','repository_bound','time_bound','task_bound']);
const approval = obj({ kind: en(['definition','plan','memory']), content_hash: digest, approved_by: { const: 'user' }, approved_at: date });
const checkpoint = obj({
  schema_version: { const: 1 }, checkpoint_id: { type: 'string', pattern: '^chk_[A-Za-z0-9-]+$' }, previous_checkpoint_id: nullable({ type: 'string', pattern: '^chk_[A-Za-z0-9-]+$' }),
  type: en(['turn','stage','named','pre_compact','recovery','final']), name: nullable(str(200)), task_id: id, run_id: id, profile_id: id,
  mode: en(['teach','implement']), stage: en(['definition','investigation','planning','implementation','review','verification','evaluation']), goal: str(5000),
  accepted_requirements: arr(str(2000), { maxItems: 100 }), confirmed_facts: arr(str(5000), { maxItems: 100 }), open_hypotheses: arr(str(5000), { maxItems: 100 }), approved_decisions: arr(str(5000), { maxItems: 100 }),
  plan: obj({ status: en(['pending','approved']), content_ref: nullable(str(1000)), content_hash: digest }), approvals: arr(approval),
  active_files: arr(obj({ path: str(2000), content_hash: digest }), { maxItems: 200 }), verifications: arr(str(5000), { maxItems: 100 }), blockers: arr(str(5000), { maxItems: 100 }), next_action: str(5000),
  context_refs: arr(obj({ item_id: id, revision: str(200), source_hash: digest })), memory_snapshot_id: nullable({ type: 'string', pattern: '^memsnap_[a-f0-9]+$' }),
  source_snapshots: arr(obj({ source_id: id, revision: str(500), selected_hashes: arr(digest), captured_at: date })),
  engine: obj({ provider: str(100), thread_id: nullable(str(500)), resume_optional: { const: true } }),
  harness: obj({ version: str(100), commit: nullable(str(100)), policies_hash: digest, skills_hash: digest }), created_at: date, integrity_hash: digest,
});
const candidate = obj({ schema_version: { const: 1 }, candidate_id: { type: 'string', pattern: '^cand_[A-Za-z0-9-]+$' }, profile_id: id, task_id: id, scope_id: str(500), kind: memoryKind, subject: str(500), statement: str(5000), limits: str(5000), confidence, sensitivity,
  evidence_refs: arr(str(2000), { minItems: 1, uniqueItems: true }), source_run_ids: arr(id, { minItems: 1, uniqueItems: true }), suggested_validity: obj({ type: validity, valid_until: nullable(date) }), duplicate_candidates: arr(id, { uniqueItems: true }), conflict_candidates: arr(id, { uniqueItems: true }), status: en(['pending','rejected','deferred','approved']), created_at: date, statement_hash: digest,
  decision: obj({ decided_at: date, decision: en(['approved','edited_and_approved','rejected','deferred']), reason: nullable(str(2000)) }) }, ['decision']);
const record = obj({ schema_version: { const: 1 }, memory_id: { type: 'string', pattern: '^mem_[A-Za-z0-9-]+$' }, profile_id: id, scope_id: str(500), kind: memoryKind, subject: str(500), status: en(['active','superseded','expired','revoked','quarantined']), sensitivity, confidence, created_at: date, verified_at: date, valid_until: nullable(date), validity_type: validity, source_run_ids: arr(id, { minItems: 1, uniqueItems: true }), evidence_refs: arr(str(2000), { minItems: 1, uniqueItems: true }), tags: arr(id, { uniqueItems: true }), revision: { type: 'integer', minimum: 1 }, previous_content_hash: nullable(digest), content_hash: digest, supersedes: nullable(id), conflicts_with: arr(id, { uniqueItems: true }), statement: str(5000), limits: str(5000), last_seen_at: date, approval, change_reason: str(2000) });
const source = obj({ source_id: id, adapter: en(['filesystem-markdown','git-repository','runbook-directory','profile-context']), root: { type: 'string', minLength: 1 }, trust: en(['authoritative','maintained','advisory','historical','untrusted']), sensitivity, read_only: { const: true }, include: arr(str(500), { minItems: 1 }), exclude: arr(str(500)), allowed_workflows: arr(id, { minItems: 1 }), freshness: obj({ strategy: en(['git-commit','file-hash','mtime']) }), max_item_bytes: { type: 'integer', minimum: 1, maximum: 1000000 } });
const registry = obj({ schema_version: { const: 1 }, profile_id: id, sources: arr(source, { uniqueItems: true }) });
const request = obj({ schema_version: { const: 1 }, retrieval_id: id, run_id: id, task_id: id, profile_id: id, workflow: id, goal: str(5000), explicit_terms: arr(str(200), { maxItems: 50 }), explicit_refs: arr(str(2000), { maxItems: 50 }), active_repository: nullable(str(2000)), active_files: arr(str(2000), { maxItems: 200 }), allowed_kinds: arr(memoryKind, { minItems: 1 }), allowed_sources: arr(id), max_sensitivity: sensitivity, reference_time: date, budget_tokens: { type: 'integer', minimum: 0, maximum: 100000 }, max_warm: { type: 'integer', minimum: 0, maximum: 5 }, max_full: { type: 'integer', minimum: 0, maximum: 8 }, max_per_source: { type: 'integer', minimum: 0, maximum: 2 }, memory_mode: en(['disabled','shadow','warm','full']) });
const item = obj({ retrieval_item_id: id, type: en(['warm','full']), item_id: id, revision: str(500), content: str(10000), profile_id: id, scope_id: str(1000), source_ref: str(2000), source_hash: digest, valid_until: nullable(date), sensitivity, confidence, reason_selected: str(1000), rank_factors: arr(id, { minItems: 1 }), estimated_tokens: { type: 'integer', minimum: 1 }, data_not_instructions: { const: true } });
const bundle = obj({ schema_version: { const: 1 }, retrieval_id: id, run_id: id, task_id: id, profile_id: id, memory_mode: en(['disabled','shadow','warm','full']), memory_snapshot_id: nullable({ type: 'string', pattern: '^memsnap_[a-f0-9]+$' }), source_snapshots: arr(obj({ source_id: id, revision: str(500), selected_hashes: arr(digest), captured_at: date })), selected: arr(item), rejected: arr(obj({ item_id: str(2000), source_id: id, reason_code: en(['PROFILE_MISMATCH','SOURCE_NOT_ALLOWED','SENSITIVITY_BLOCKED','STATUS_INACTIVE','EXPIRED','CONFLICTED','HASH_INVALID','WORKFLOW_NOT_ALLOWED','LOW_RELEVANCE','BUDGET_EXCEEDED','DUPLICATE','SOURCE_UNAVAILABLE','PATH_BLOCKED']) })), estimated_tokens: { type: 'integer', minimum: 0 }, injected: { type: 'boolean' }, created_at: date });
const manifest = obj({ schema_version: { const: 2 }, run_id: id, task_id: id, harness_version: str(100), harness_commit: nullable(str(100)), telemetry_schema_version: { const: 2 }, memory_schema_version: { const: 1 }, checkpoint_schema_version: { const: 1 }, retrieval_schema_version: { const: 1 }, profile_id: id, mode: en(['teach','implement']), workflow: id,
  engine: obj({ provider: str(100), model: nullable(str(200)), reasoning_effort: nullable(str(100)), codex_version: nullable(str(100)), thread_id: nullable(str(500)) }),
  native_codex_memory: obj({ use: { const: false }, generate: { const: false }, external_context_generation: { const: false }, policy_reason: { const: 'megabrain_managed_memory' } }),
  configuration: obj({ config_hash: digest, policies_hash: digest, skills_hash: digest }), continuity: obj({ resumed: { type: 'boolean' }, strategy: en(['new','thread','checkpoint_new_thread','checkpoint_only']), checkpoint_id: nullable(str(200)) }), memory: obj({ snapshot_id: nullable(str(200)), selected_ids: arr(id) }), sources: obj({ registry_hash: digest, snapshots: arr({ type: 'object' }) }), eval_suite_version: str(100) });
const schemas = { checkpoint, 'memory-candidate': candidate, 'memory-record': record, 'retrieval-request': request, 'retrieval-item': item, 'context-bundle': bundle, 'source-registry': registry, 'run-manifest-v2': manifest };
for (const [name, schema] of Object.entries(schemas)) writeFileSync(resolve(root, `${name}.schema.json`), JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', $id: `v2-${name}`, ...schema }, null, 2) + '\n');
console.log(`${Object.keys(schemas).length} schemas v0.2 gerados.`);
