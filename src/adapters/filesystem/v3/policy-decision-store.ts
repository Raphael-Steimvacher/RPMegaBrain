import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PolicyDecision } from '../../../domain/v3/contracts.js';
import { DomainError } from '../../../domain/policy.js';
import { atomicWrite } from '../../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../../infrastructure/v2/paths.js';
import { validateV3 } from '../../../infrastructure/v3/validation.js';

export class PolicyDecisionStore {
  private readonly root: string;
  constructor(stateRoot: string, profileId: string) { assertIdentifier(profileId, 'profile_id'); this.root = join(stateRoot, 'profiles', profileId, 'connectors', 'decisions'); ensurePrivateDirectory(this.root); }
  put(value: PolicyDecision): PolicyDecision { validateV3('policy-decision', value); atomicWrite(join(this.root, `${value.decision_id}.json`), JSON.stringify(value, null, 2) + '\n'); return value; }
  get(id: string): PolicyDecision { assertIdentifier(id, 'decision_id'); const path = join(this.root, `${id}.json`); if (!existsSync(path)) throw new DomainError('POLICY_DECISION_NOT_FOUND', 'Decisão não encontrada.'); return validateV3<PolicyDecision>('policy-decision', JSON.parse(readFileSync(path, 'utf8'))); }
}
