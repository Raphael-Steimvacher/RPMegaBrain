import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConnectorBinding, ConsentReceipt, ExternalRef, IntegrationManifestV3 } from '../../../domain/v3/contracts.js';
import { DomainError } from '../../../domain/policy.js';
import { atomicWrite } from '../../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../../infrastructure/v2/paths.js';
import { validateV3 } from '../../../infrastructure/v3/validation.js';

export class IntegrationManifestStore {
  constructor(private readonly stateRoot: string, private readonly profileId: string) { assertIdentifier(profileId, 'profile_id'); }
  private path(runId: string): string { assertIdentifier(runId, 'run_id'); return join(this.stateRoot, 'profiles', this.profileId, 'runs', runId, 'integration-manifest-v3.json'); }
  write(input: { run_id: string; task_id: string; connectors: ConnectorBinding[]; capabilities: string[]; receipts: ConsentReceipt[]; refs: ExternalRef[]; writes?: IntegrationManifestV3['write_actions'] }): IntegrationManifestV3 {
    const previous = existsSync(this.path(input.run_id)) ? this.read(input.run_id) : null;
    if (previous && previous.task_id !== input.task_id) throw new DomainError('INTEGRATION_MANIFEST_IDENTITY_MISMATCH', 'Run já pertence a outra tarefa.');
    const connectorMap = new Map((previous?.connectors ?? []).map(item => [item.connector_id, item]));
    for (const connector of input.connectors) connectorMap.set(connector.connector_id, { connector_id: connector.connector_id, catalog_hash: connector.catalog_hash, identity_verified: connector.identity_verified });
    const value: IntegrationManifestV3 = { schema_version: 3, run_id: input.run_id, task_id: input.task_id, profile_id: this.profileId, harness_version: '0.3.0-alpha.1',
      telemetry_schema_version: 3, integration_schema_version: 1, connector_registry_schema_version: 1, capability_schema_version: 1, consent_schema_version: 1, external_ref_schema_version: 1,
      connector_snapshot_id: previous?.connector_snapshot_id ?? `connsnap_${randomUUID()}`, connectors: [...connectorMap.values()],
      allowed_capabilities: [...new Set([...(previous?.allowed_capabilities ?? []), ...input.capabilities])], consent_receipt_ids: [...new Set([...(previous?.consent_receipt_ids ?? []), ...input.receipts.map(item => item.receipt_id)])], external_ref_ids: [...new Set([...(previous?.external_ref_ids ?? []), ...input.refs.map(item => item.external_ref_id)])],
      write_actions: [...new Map([...(previous?.write_actions ?? []), ...(input.writes ?? [])].map(item => [`${item.capability}:${item.payload_hash}:${item.receipt_id}`, item])).values()], created_at: previous?.created_at ?? new Date().toISOString() };
    validateV3('integration-manifest', value); const path = this.path(input.run_id); ensurePrivateDirectory(join(this.stateRoot, 'profiles', this.profileId, 'runs', input.run_id)); atomicWrite(path, JSON.stringify(value, null, 2) + '\n'); return value;
  }
  read(runId: string): IntegrationManifestV3 { const path = this.path(runId); if (!existsSync(path)) throw new DomainError('INTEGRATION_MANIFEST_NOT_FOUND', 'Manifest v3 não encontrado.'); const value = validateV3<IntegrationManifestV3>('integration-manifest', JSON.parse(readFileSync(path, 'utf8'))); if (value.profile_id !== this.profileId || value.run_id !== runId) throw new DomainError('PROFILE_MISMATCH', 'Manifest pertence a outro perfil/run.'); return value; }
}
