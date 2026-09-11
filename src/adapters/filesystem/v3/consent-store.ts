import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CapabilityRequest, ConsentReceipt, EffectClass } from '../../../domain/v3/contracts.js';
import { DomainError } from '../../../domain/policy.js';
import { stableJson } from '../../../infrastructure/hashing.js';
import { atomicWrite } from '../../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../../infrastructure/v2/paths.js';
import { validateV3 } from '../../../infrastructure/v3/validation.js';
import { IntegrationEventLog } from '../../../infrastructure/v3/events.js';

export interface GrantConsent {
  request: CapabilityRequest;
  effect_class: EffectClass;
  actor: 'user';
  source_interaction: string;
  policy_hash: string;
  expires_at: string;
  bind_to: 'standing' | 'task' | 'run' | 'call';
}
export class ConsentStore {
  readonly root: string;
  constructor(stateRoot: string, readonly profileId: string, private readonly events: IntegrationEventLog) {
    assertIdentifier(profileId, 'profile_id'); this.root = join(stateRoot, 'profiles', profileId, 'connectors', 'consent'); ensurePrivateDirectory(this.root);
  }
  grant(input: GrantConsent): ConsentReceipt {
    if (input.request.profile_id !== this.profileId || input.actor !== 'user') throw new DomainError('PROFILE_MISMATCH', 'Consentimento pertence a outro perfil.');
    if (!['standing','task','run','call'].includes(input.bind_to)) throw new DomainError('INVALID_CONSENT_BINDING', 'Binding de consentimento inválido.');
    if (input.effect_class === 'W2' || input.effect_class === 'W3') throw new DomainError('EFFECT_HARD_DENIED', 'A v0.3 não emite consentimento para esse efeito.');
    if (new Date(input.expires_at).getTime() <= Date.now()) throw new DomainError('CONSENT_EXPIRED', 'Consentimento já expirou.');
    if (input.effect_class === 'W1' && (!input.request.payload_hash || input.bind_to !== 'call')) throw new DomainError('PAYLOAD_APPROVAL_REQUIRED', 'Draft exige aprovação humana por payload e chamada.');
    const receipt: ConsentReceipt = { schema_version: 1, receipt_id: `consent_${randomUUID()}`, actor: 'user', profile_id: this.profileId,
      connector_id: input.request.connector_id, capability: input.request.capability, resource_scope: structuredClone(input.request.resources), purpose: input.request.purpose,
      effect_class: input.effect_class, payload_hash: input.request.payload_hash, task_id: input.bind_to === 'standing' ? null : input.request.task_id,
      run_id: input.bind_to === 'run' || input.bind_to === 'call' ? input.request.run_id : null, granted_at: new Date().toISOString(), expires_at: input.expires_at,
      source_interaction: input.source_interaction, policy_hash: input.policy_hash, status: 'active' };
    validateV3('consent-receipt', receipt); atomicWrite(join(this.root, `${receipt.receipt_id}.json`), JSON.stringify(receipt, null, 2) + '\n');
    this.events.emit({ event: 'consent.granted', run_id: input.request.run_id, task_id: input.request.task_id, connector_id: input.request.connector_id,
      attributes: { receipt_id: receipt.receipt_id, capability: receipt.capability, effect_class: receipt.effect_class } }); return receipt;
  }
  list(): ConsentReceipt[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root).filter(name => /^consent_[A-Za-z0-9-]+\.json$/.test(name)).map(name => validateV3<ConsentReceipt>('consent-receipt', JSON.parse(readFileSync(join(this.root, name), 'utf8'))));
  }
  get(receiptId: string): ConsentReceipt {
    assertIdentifier(receiptId, 'receipt_id'); const path = join(this.root, `${receiptId}.json`); if (!existsSync(path)) throw new DomainError('CONSENT_NOT_FOUND', 'Consentimento não encontrado.');
    const value = validateV3<ConsentReceipt>('consent-receipt', JSON.parse(readFileSync(path, 'utf8'))); if (value.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Consentimento pertence a outro perfil.'); return value;
  }
  matching(request: CapabilityRequest, policyHash: string, at = new Date()): ConsentReceipt | null {
    return this.list().find(receipt => receipt.status === 'active' && new Date(receipt.expires_at) > at && receipt.connector_id === request.connector_id &&
      receipt.capability === request.capability && receipt.policy_hash === policyHash && receipt.purpose === request.purpose &&
      stableJson(receipt.resource_scope) === stableJson(request.resources) && (receipt.task_id === null || receipt.task_id === request.task_id) &&
      (receipt.run_id === null || receipt.run_id === request.run_id) && (receipt.payload_hash === null || receipt.payload_hash === request.payload_hash)) ?? null;
  }
  revoke(receiptId: string): ConsentReceipt {
    const receipt = this.get(receiptId); const next = { ...receipt, status: 'revoked' as const }; atomicWrite(join(this.root, `${receiptId}.json`), JSON.stringify(next, null, 2) + '\n');
    this.events.emit({ event: 'consent.revoked', run_id: receipt.run_id, task_id: receipt.task_id, connector_id: receipt.connector_id, attributes: { receipt_id: receiptId } }); return next;
  }
  purgeExpired(at = new Date()): number {
    let count = 0; for (const receipt of this.list()) if (receipt.status !== 'active' || new Date(receipt.expires_at) <= at) { rmSync(join(this.root, `${receipt.receipt_id}.json`)); count += 1; } return count;
  }
  purgeConnector(connectorId: string): number { let count = 0; for (const receipt of this.list()) if (receipt.connector_id === connectorId) { rmSync(join(this.root, `${receipt.receipt_id}.json`)); count += 1; } return count; }
}
