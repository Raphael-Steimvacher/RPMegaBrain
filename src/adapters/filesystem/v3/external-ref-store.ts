import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { ExternalRef } from '../../../domain/v3/contracts.js';
import { DomainError } from '../../../domain/policy.js';
import { atomicWrite } from '../../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../../infrastructure/v2/paths.js';
import { validateV3 } from '../../../infrastructure/v3/validation.js';

export class ExternalRefStore {
  readonly root: string;
  constructor(stateRoot: string, readonly profileId: string) { assertIdentifier(profileId, 'profile_id'); this.root = join(stateRoot, 'profiles', profileId, 'external-refs'); ensurePrivateDirectory(this.root); }
  put(reference: ExternalRef): ExternalRef {
    if (reference.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Referência pertence a outro perfil.'); validateV3('external-ref', reference);
    atomicWrite(join(this.root, `${reference.external_ref_id}.json`), JSON.stringify(reference, null, 2) + '\n'); return reference;
  }
  get(id: string): ExternalRef { assertIdentifier(id, 'external_ref_id'); const path = join(this.root, `${id}.json`); if (!existsSync(path)) throw new DomainError('EXTERNAL_REF_NOT_FOUND', 'Referência externa não encontrada.'); return validateV3<ExternalRef>('external-ref', JSON.parse(readFileSync(path, 'utf8'))); }
  list(): ExternalRef[] { return existsSync(this.root) ? readdirSync(this.root).filter(name => /^ext_[A-Za-z0-9-]+\.json$/.test(name)).map(name => this.get(name.slice(0, -5))) : []; }
  updateStatus(id: string, status: ExternalRef['status'], revision?: string): ExternalRef { const current = this.get(id); const next = { ...current, status, ...(revision ? { revision } : {}) }; return this.put(next); }
  purgeConnector(connectorId: string): number { let count = 0; for (const ref of this.list()) if (ref.connector_id === connectorId) { rmSync(join(this.root, `${ref.external_ref_id}.json`)); count += 1; } return count; }
}
