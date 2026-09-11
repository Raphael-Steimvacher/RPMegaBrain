import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DraftIntent, DraftPayload } from '../../../domain/v3/contracts.js';
import { DomainError } from '../../../domain/policy.js';
import { hash, stableJson } from '../../../infrastructure/hashing.js';
import { detectedSecretCodes } from '../../../infrastructure/v2/secrets.js';
import { atomicWrite } from '../../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../../infrastructure/v2/paths.js';

export class DraftIntentStore {
  readonly root: string;
  constructor(stateRoot: string, readonly profileId: string) { assertIdentifier(profileId, 'profile_id'); this.root = join(stateRoot, 'profiles', profileId, 'draft-intents'); ensurePrivateDirectory(this.root); }
  create(input: { connector_id: string | null; task_id: string; run_id: string; payload: DraftPayload; mode: DraftIntent['mode'] }): DraftIntent {
    if (input.payload.attachments.length) throw new DomainError('ATTACHMENT_BLOCKED', 'Anexos são proibidos na v0.3.');
    if (!input.payload.from_account || !input.payload.to.length || !input.payload.subject || !input.payload.body) throw new DomainError('INVALID_DRAFT', 'Conta, destinatário, assunto e corpo são obrigatórios.');
    if (new Set(input.payload.to).size !== input.payload.to.length || input.payload.to.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))) throw new DomainError('INVALID_RECIPIENT', 'Destinatários devem ser explícitos, únicos e válidos.');
    if (detectedSecretCodes(input.payload.body).length) throw new DomainError('SECRET_DETECTED', 'Segredo detectado no draft.');
    const payloadHash = hash(stableJson(input.payload)); const intent: DraftIntent = { schema_version: 1, draft_intent_id: `draft_${randomUUID()}`, profile_id: this.profileId,
      connector_id: input.connector_id, task_id: input.task_id, run_id: input.run_id, payload: structuredClone(input.payload), payload_hash: payloadHash,
      mode: input.mode, status: 'pending', consent_receipt_id: null, provider_draft_id: null, created_at: new Date().toISOString() };
    atomicWrite(join(this.root, `${intent.draft_intent_id}.json`), JSON.stringify(intent, null, 2) + '\n'); return intent;
  }
  get(id: string): DraftIntent { assertIdentifier(id, 'draft_intent_id'); const path = join(this.root, `${id}.json`); if (!existsSync(path)) throw new DomainError('DRAFT_INTENT_NOT_FOUND', 'Draft intent não encontrado.'); const value = JSON.parse(readFileSync(path, 'utf8')) as DraftIntent; if (value.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Draft pertence a outro perfil.'); return value; }
  update(id: string, fn: (value: DraftIntent) => DraftIntent): DraftIntent { const next = fn(this.get(id)); if (hash(stableJson(next.payload)) !== next.payload_hash) throw new DomainError('PAYLOAD_CHANGED', 'Payload mudou e exige nova aprovação.'); atomicWrite(join(this.root, `${id}.json`), JSON.stringify(next, null, 2) + '\n'); return next; }
  purgeConnector(connectorId: string): number { let count = 0; for (const name of readdirSync(this.root).filter(value => /^draft_[A-Za-z0-9-]+\.json$/.test(value))) { const intent = this.get(name.slice(0, -5)); if (intent.connector_id === connectorId) { rmSync(join(this.root, name)); count += 1; } } return count; }
}
