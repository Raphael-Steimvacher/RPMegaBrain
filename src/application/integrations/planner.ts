import { randomUUID } from 'node:crypto';
import type { CapabilityRequest, ConnectorBinding, ExternalSensitivity } from '../../domain/v3/contracts.js';
import { ConnectorRegistryStore } from '../../adapters/filesystem/v3/connector-registry.js';
import { DomainError } from '../../domain/policy.js';

export interface IntegrationIntent {
  run_id: string;
  task_id: string;
  profile_id: string;
  workflow: string;
  capability: string;
  purpose: string;
  resources: Record<string, string | string[]>;
  query?: string | null;
  requested_fields?: string[];
  sensitivity_ceiling: ExternalSensitivity;
  destination?: string;
}
export class IntegrationPlanner {
  constructor(private readonly registry: ConnectorRegistryStore) {}
  select(intent: IntegrationIntent): { connector: ConnectorBinding; request: CapabilityRequest } {
    if (intent.profile_id !== this.registry.profileId) throw new DomainError('PROFILE_MISMATCH', 'Intent pertence a outro perfil.');
    const candidates = this.registry.list().filter(item => item.profile_id === intent.profile_id && item.state === 'healthy' && item.capability_allowlist.some(capability => capability === intent.capability));
    if (!candidates.length) throw new DomainError('CONNECTOR_NOT_FOUND', 'Nenhum connector saudável atende a capability.');
    if (candidates.length > 1) throw new DomainError('CONNECTOR_AMBIGUOUS', 'Selecione explicitamente o connector; nenhuma conta será escolhida silenciosamente.');
    const connector = candidates[0]!; const request: CapabilityRequest = { schema_version: 1, request_id: `ireq_${randomUUID()}`, run_id: intent.run_id, task_id: intent.task_id,
      profile_id: intent.profile_id, workflow: intent.workflow, connector_id: connector.connector_id, capability: intent.capability, purpose: intent.purpose,
      resources: structuredClone(intent.resources), query: intent.query ?? null, requested_fields: intent.requested_fields ?? [], pagination: { page_size: 20, max_pages: 2, max_items: 20 },
      sensitivity_ceiling: intent.sensitivity_ceiling, destination: intent.destination ?? 'current_context', payload_hash: null, created_at: new Date().toISOString() };
    return { connector, request };
  }
}
