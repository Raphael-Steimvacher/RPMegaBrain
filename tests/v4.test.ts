import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EvaluationService } from '../src/application/evaluation/service.js';
import { DomainError } from '../src/domain/policy.js';

function environment(t: { after: (fn: () => void) => void }, profile = 'personal'): EvaluationService {
  const root = mkdtempSync(join(tmpdir(), 'megabrain-v4-')); t.after(() => rmSync(root, { recursive: true, force: true })); return new EvaluationService(root, profile);
}
function contract(app: EvaluationService, taskId = 'TASK-1') {
  return app.freezeContract(app.createContract({ task_id: taskId, profile_id: app.profileId, mode: 'teach', goal: 'Avaliar fixture sintética', task_family: 'planning', requirements: [{ id: 'R1', statement: 'A verificação deve passar.' }] }).contract_id);
}

test('Task Contract congela por hash e revisão não altera a versão anterior', t => {
  const app = environment(t); const first = contract(app); assert.equal(first.status, 'frozen'); assert.match(first.content_hash, /^sha256:/);
  const revised = app.reviseContract(first.contract_id, { goal: 'Objetivo revisado' }); assert.equal(revised.contract_version, 2); assert.equal(app.showContract(first.contract_id).status, 'superseded'); assert.equal(app.showContract(revised.contract_id).status, 'draft');
  assert.throws(() => app.runEvaluation(revised.contract_id, 'missing'), (error: unknown) => error instanceof DomainError && error.code === 'V4_RECORD_NOT_FOUND');
});

test('Evidence Bundle redige conteúdo e mantém integridade sem chain-of-thought', t => {
  const app = environment(t); const frozen = contract(app); const bundle = app.buildEvidence(frozen.contract_id, { run_id: 'RUN-1', task_id: frozen.task_id, profile_id: 'personal', output: 'token=sk-secret123 e scratchpad privado', events: [{ event_name: 'tool.completed', outcome: 'success', timestamp: new Date().toISOString(), prompt: 'não persistir' }] });
  assert.equal(app.verifyBundle(bundle.bundle_id).valid, true); assert.equal(bundle.outcome.output_redacted, true); assert.ok(bundle.execution.events[0]?.content_hash); assert.equal(JSON.stringify(bundle).includes('scratchpad privado'), false); assert.equal(JSON.stringify(bundle).includes('sk-secret123'), false);
});

test('Evento corrompido bloqueia a avaliabilidade em vez de ganhar interpretação silenciosa', t => {
  const app = environment(t); const frozen = contract(app); const bundle = app.buildEvidence(frozen.contract_id, { run_id: 'RUN-CORRUPT', task_id: frozen.task_id, profile_id: 'personal', events: [{ event_name: 'tool.completed', timestamp: 'not-a-date' }] });
  assert.equal(bundle.integrity.status, 'blocked'); assert.deepEqual(bundle.integrity.unknown_fields, ['event[0].timestamp']);
});

test('Evaluator não confunde teste aprovado com requisito sem prova', t => {
  const app = environment(t); const frozen = contract(app); const bundle = app.buildEvidence(frozen.contract_id, { run_id: 'RUN-2', task_id: frozen.task_id, profile_id: 'personal', verification: [{ verification_id: 'V1', kind: 'test', status: 'passed', requirement_ids: [], valid_for: [] }] });
  const result = app.runEvaluation(frozen.contract_id, bundle.bundle_id); assert.equal(result.status, 'INCONCLUSIVE'); assert.equal(result.requirements.mandatory.inconclusive, 1); assert.equal(result.model_grader.enabled, false);
});

test('Hard gate de profile e efeito proibido sempre resulta FAIL', t => {
  const app = environment(t); const frozen = contract(app); const bundle = app.buildEvidence(frozen.contract_id, { run_id: 'RUN-3', task_id: frozen.task_id, profile_id: 'personal', policy: { profile_matches: false, forbidden_effects_observed: ['external_write'] } });
  const result = app.runEvaluation(frozen.contract_id, bundle.bundle_id); assert.equal(result.status, 'FAIL'); assert.ok(result.hard_gates.failed >= 2);
});

test('Diagnosis separa hipótese de fato e retries não confirmam pattern', t => {
  const app = environment(t); const first = contract(app, 'TASK-A'); const second = contract(app, 'TASK-B');
  for (const [run, item] of [['RUN-A', first], ['RUN-A-RETRY', first], ['RUN-B', second]] as const) {
    const bundle = app.buildEvidence(item.contract_id, { run_id: run, task_id: item.task_id, profile_id: 'personal', policy: { profile_matches: false } }); const result = app.runEvaluation(item.contract_id, bundle.bundle_id); app.diagnose(result.evaluation_id);
  }
  const candidates = app.scanPatterns(); assert.equal(candidates.length, 1); assert.equal(candidates[0]?.independent_case_count, 2); assert.equal(candidates[0]?.status, 'candidate');
});
