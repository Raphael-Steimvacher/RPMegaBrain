import type { CapabilityRequest, ConnectorBinding, DraftPayload, ProviderResult, ToolCatalogEntry } from './contracts.js';

export interface ProviderIdentity {
  account_subject_hash: string;
  tenant_or_org_id_hash: string | null;
  granted_scopes: string[];
}
export interface ProviderResponse {
  results: ProviderResult[];
  completeness: 'complete' | 'partial';
  pages_fetched: number;
  stopped_reason: string | null;
}
export interface DraftResponse { draft_id: string; revision: string; }

export interface ConnectorPort {
  readonly provider: ConnectorBinding['provider'];
  discoverCapabilities(): ToolCatalogEntry[];
  verifyIdentity(): Promise<ProviderIdentity>;
  healthCheck(): Promise<'healthy' | 'degraded' | 'auth_required'>;
  executeRead(request: CapabilityRequest): Promise<ProviderResponse>;
  getRevision(objectIdHash: string): Promise<string | null>;
  disconnect(): Promise<void>;
}

export interface SourceControlPort extends ConnectorPort {}
export interface IssueTrackerPort extends ConnectorPort {}
export interface CloudDrivePort extends ConnectorPort {}
export interface MailPort extends ConnectorPort {
  executeReversibleWrite(request: CapabilityRequest, payload: DraftPayload, idempotencyKey: string): Promise<DraftResponse>;
}
export type MailConnectorPort = MailPort;
