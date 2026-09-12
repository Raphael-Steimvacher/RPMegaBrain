import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CandidateService } from '../src/application/candidates/service.js';
import { validateV5 } from '../src/infrastructure/v5/validation.js';

test('v0.5 mantém o estado de candidate fora do repositório e schemas fechados', t => {
  const state = mkdtempSync(join(tmpdir(), 'megabrain-v5-')); t.after(() => rmSync(state, { recursive: true, force: true }));
  const app = new CandidateService(state, 'personal'); assert.ok(app); assert.throws(() => validateV5('candidate-request', { schema_version: 1, unexpected: true }));
  assert.throws(() => validateV5('run-manifest-v5', { schema_version: 5, candidate_id: 'cand_test', proposal_ref: 'prop@1', authorization_hash: null, repository_identity: 'sha256:x', base_sha: 'abc', revision: 1, capabilities: { candidate_write: true, baseline_write: false, main_checkout_write: false, git_remote: false, external_write: false }, unexpected: true }));
});

test('receipt de freeze precisa vincular o change set exato', () => {
  const authorization = { schema_version: 1, authorization_id: 'freeze_auth_test', candidate_id: 'cand_test', proposal_ref: { id: 'proposal_test', version: 1 }, profile_id: 'personal', repository_identity: 'sha256:repo', base_sha: 'abc', revision: 1, allowed_paths: ['src/**'], allowed_operations: ['local_snapshot'], forbidden_operations: ['network'], diff_budget: { files: 1, added_lines: 1, deleted_lines: 1 }, authorized_by: 'user', authorized_at: '2026-09-12T12:00:00.000Z', expires_at: '2026-09-12T12:30:00.000Z', scope_hash: 'sha256:scope', payload_hash: 'sha256:payload' };
  validateV5('candidate-authorization', authorization);
  const withoutScope = { ...authorization }; delete (withoutScope as Partial<typeof authorization>).scope_hash;
  assert.throws(() => validateV5('candidate-authorization', withoutScope));
});
