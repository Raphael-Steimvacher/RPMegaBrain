import type { CapabilityRequest, ConnectorBinding, DraftPayload, ProviderResult, ToolCatalogEntry } from '../../domain/v3/contracts.js';
import type { DraftResponse, MailConnectorPort, ProviderIdentity, ProviderResponse } from '../../domain/v3/ports.js';
import { hash, stableJson } from '../../infrastructure/hashing.js';

export class ProviderFailure extends Error { constructor(readonly status: number, readonly safeCode: string, readonly retryAfterMs = 0) { super(safeCode); } }
export interface FakeProviderFixture {
  identity: ProviderIdentity;
  tools: ToolCatalogEntry[];
  objects: Record<string, ProviderResult[]>;
  failures?: Record<string, number[]>;
}
export class FakeConnectorAdapter implements MailConnectorPort {
  readonly provider: ConnectorBinding['provider'];
  private readonly calls = new Map<string, number>();
  private readonly drafts = new Map<string, DraftResponse>();
  constructor(readonly binding: ConnectorBinding, private readonly fixture: FakeProviderFixture) { this.provider = binding.provider; }
  discoverCapabilities(): ToolCatalogEntry[] { return structuredClone(this.fixture.tools); }
  async verifyIdentity(): Promise<ProviderIdentity> { return structuredClone(this.fixture.identity); }
  async healthCheck(): Promise<'healthy'> { return 'healthy'; }
  async executeRead(request: CapabilityRequest): Promise<ProviderResponse> {
    this.maybeFail(request.capability); const all = structuredClone(this.fixture.objects[request.capability] ?? []);
    const max = Math.min(request.pagination.max_items, request.pagination.max_pages * request.pagination.page_size);
    const results = all.slice(0, max); return { results, completeness: results.length < all.length ? 'partial' : 'complete',
      pages_fetched: results.length ? Math.ceil(results.length / request.pagination.page_size) : 0, stopped_reason: results.length < all.length ? 'pagination_limit' : null };
  }
  async getRevision(objectIdHash: string): Promise<string | null> {
    for (const results of Object.values(this.fixture.objects)) for (const result of results) if (hash(result.object_id) === objectIdHash) return result.revision; return null;
  }
  async executeReversibleWrite(request: CapabilityRequest, payload: DraftPayload, idempotencyKey: string): Promise<DraftResponse> {
    this.maybeFail(request.capability); const existing = this.drafts.get(idempotencyKey); if (existing) return existing;
    const response = { draft_id: `fake-draft-${this.drafts.size + 1}`, revision: hash(stableJson(payload)) }; this.drafts.set(idempotencyKey, response); return response;
  }
  async disconnect(): Promise<void> { /* Fake provider has no credential or remote session. */ }
  draftCount(): number { return this.drafts.size; }
  private maybeFail(capability: string): void {
    const count = this.calls.get(capability) ?? 0; this.calls.set(capability, count + 1); const status = this.fixture.failures?.[capability]?.[count];
    if (status) throw new ProviderFailure(status, status === 401 ? 'AUTH_EXPIRED' : status === 403 ? 'SCOPE_MISMATCH' : status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE', status === 429 ? 1 : 0);
  }
}
