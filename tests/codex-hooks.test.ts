import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodexHookJournalStore } from '../src/infrastructure/codex-hooks.js';
import { hash } from '../src/infrastructure/hashing.js';
import { DomainError } from '../src/domain/policy.js';
import { EvaluationService } from '../src/application/evaluation/service.js';
import { CodexEvidenceAssembler } from '../src/application/codex-hooks/evidence.js';

const isCode = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;
function environment(t: { after: (fn: () => void) => void }) { const root = mkdtempSync(join(tmpdir(), 'megabrain-codex-hooks-')); t.after(() => rmSync(root, { recursive: true, force: true })); const store = new CodexHookJournalStore(root, 'personal'); store.register('pilot-dotfiles', hash('hooks')); return { root, store }; }
function files(root: string): string[] { const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [readFileSync(join(path, entry.name), 'utf8')]); return walk(root); }
function input(overrides: Record<string, unknown> = {}) { return { session_id: 'thr-sensitive-session', hook_event_name: 'PreToolUse', timestamp: '2026-09-12T18:00:00.000Z', turn_id: 'turn-1', tool_use_id: 'tool-1', tool_name: 'Bash', permission_mode: 'plan', model: 'gpt-test', prompt: 'não persistir', transcript_path: '/private/transcript.jsonl', tool_input: { command: 'token=sk-secret123456' }, ...overrides }; }

test('sanitiza envelope do Codex sem persistir prompt, transcript ou input de ferramenta', t => {
  const { root, store } = environment(t); const event = store.ingest('pilot-dotfiles', input());
  assert.equal(event.hook_event, 'PreToolUse'); assert.equal(event.tool_name, 'Bash'); assert.equal(event.permission_mode, 'plan'); assert.equal(event.sequence_id, 1); assert.notEqual(event.session_ref, 'thr-sensitive-session'); assert.notEqual(event.turn_ref, 'turn-1');
  const serialized = files(root).join('\n'); for (const forbidden of ['não persistir', 'transcript.jsonl', 'token=sk-secret', 'thr-sensitive-session', 'turn-1', 'tool-1']) assert.ok(!serialized.includes(forbidden));
});

test('reentrega idêntica é idempotente e sequência cresce sob a mesma sessão', t => {
  const { store } = environment(t); const first = store.ingest('pilot-dotfiles', input()); const retry = store.ingest('pilot-dotfiles', input());
  const second = store.ingest('pilot-dotfiles', input({ hook_event_name: 'PostToolUse', timestamp: '2026-09-12T18:00:01.000Z' }));
  assert.equal(retry.event_id, first.event_id); assert.equal(second.sequence_id, 2); assert.equal(store.list(first.session_ref).length, 2);
});

test('registration, profile e selo protegem contra mistura e evento tardio', t => {
  const { store } = environment(t); assert.throws(() => store.ingest('unknown-repo', input()), isCode('HOOK_NOT_ACTIVE'));
  const event = store.ingest('pilot-dotfiles', input()); const seal = store.seal(event.session_ref); assert.equal(seal.event_count, 1); assert.match(seal.journal_hash, /^sha256:/);
  assert.throws(() => store.ingest('pilot-dotfiles', input({ timestamp: '2026-09-12T18:00:02.000Z' })), isCode('HOOK_EVENT_AFTER_SEAL'));
});

test('entrada malformada ou evento fora da allowlist é recusado', t => {
  const { store } = environment(t); assert.throws(() => store.ingest('pilot-dotfiles', { hook_event_name: 'UserPromptSubmit', session_id: 'thr-1' }), isCode('HOOK_INPUT_REJECTED'));
  assert.throws(() => store.ingest('pilot-dotfiles', { hook_event_name: 'Stop', session_id: '' }), isCode('HOOK_INPUT_REJECTED'));
});

test('sessão de hooks só vira Evidence Bundle com contrato congelado e sem conteúdo bruto', t => {
  const { root, store } = environment(t); const event = store.ingest('pilot-dotfiles', input({ hook_event_name: 'SessionStart', source: 'startup', prompt: 'segredo do chat' }));
  const evaluation = new EvaluationService(root, 'personal'); const contract = evaluation.freezeContract(evaluation.createContract({ task_id: 'TASK-HOOK', profile_id: 'personal', mode: 'teach', goal: 'Fixture', task_family: 'planning', requirements: [{ id: 'R1', statement: 'Proof explícita.' }] }).contract_id);
  const bundle = new CodexEvidenceAssembler(root, 'personal').build(contract.contract_id, event.session_ref, 'RUN-HOOK');
  assert.equal(bundle.integrity.status, 'partial'); assert.equal(bundle.integrity.raw_trace_available, false); assert.equal(bundle.outcome.output_hash, null); assert.equal(bundle.execution.events[0]?.event_name, 'codex.SessionStart'); assert.ok(!JSON.stringify(bundle).includes('segredo do chat'));
});
