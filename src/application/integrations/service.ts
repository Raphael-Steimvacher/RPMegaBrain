import { hash, stableJson } from '../../infrastructure/hashing.js';
import type { CapabilityRequest, DraftIntent, IntegrationResult, PolicyDecision } from '../../domain/v3/contracts.js';
import type { ConnectorPort, MailConnectorPort } from '../../domain/v3/ports.js';
import { capabilityCatalog } from '../../domain/v3/catalog.js';
import { DomainError } from '../../domain/policy.js';
import { ConnectorRegistryStore } from '../../adapters/filesystem/v3/connector-registry.js';
import { ConsentStore } from '../../adapters/filesystem/v3/consent-store.js';
import { ExternalRefStore } from '../../adapters/filesystem/v3/external-ref-store.js';
import { DraftIntentStore } from '../../adapters/filesystem/v3/draft-intent-store.js';
import { IntegrationManifestStore } from '../../adapters/filesystem/v3/integration-manifest-store.js';
import { PolicyDecisionStore } from '../../adapters/filesystem/v3/policy-decision-store.js';
import { ProviderFailure } from '../../adapters/integrations/fake-provider.js';
import { PolicyGateway, integrationPolicyHash } from './policy-gateway.js';
import { OutputGuard } from './output-guard.js';

export class IntegrationService {
  readonly consents: ConsentStore;
  readonly refs: ExternalRefStore;
  readonly drafts: DraftIntentStore;
  readonly manifests: IntegrationManifestStore;
  readonly decisions: PolicyDecisionStore;
  constructor(readonly registry: ConnectorRegistryStore, private readonly adapters: ReadonlyMap<string, ConnectorPort>,
    private readonly gateway = new PolicyGateway(), private readonly guard = new OutputGuard()) {
    this.consents = new ConsentStore(registry.stateRoot, registry.profileId, registry.events); this.refs = new ExternalRefStore(registry.stateRoot, registry.profileId);
    this.drafts = new DraftIntentStore(registry.stateRoot, registry.profileId); this.manifests = new IntegrationManifestStore(registry.stateRoot, registry.profileId);
    this.decisions = new PolicyDecisionStore(registry.stateRoot, registry.profileId);
  }
  check(request: CapabilityRequest): PolicyDecision {
    const document = this.registry.read(); const connector = document.connectors.find(item => item.connector_id === request.connector_id) ?? null;
    let catalog = null; try { catalog = connector ? this.registry.getCatalog(connector.connector_id) : null; } catch { /* Gateway fails closed. */ }
    const result = this.decisions.put(this.gateway.evaluate(request, connector, catalog, this.consents, document.integration_mode));
    this.registry.events.emit({ event: 'integration.policy_decided', run_id: request.run_id, task_id: request.task_id, connector_id: request.connector_id,
      attributes: { capability: request.capability, decision: result.decision, reason_code: result.reason_codes[0] ?? null } }); return result;
  }
  async execute(request: CapabilityRequest): Promise<IntegrationResult> {
    const started = Date.now(); const decision = this.check(request); if (decision.decision !== 'ALLOW') return { decision, results: [], external_refs: [], context: [], completeness: 'partial' };
    if (capabilityCatalog.get(request.capability)?.effect_class === 'W1') throw new DomainError('DRAFT_FLOW_REQUIRED', 'Escrita reversível só pode usar o fluxo de draft com idempotência.');
    const connector = this.registry.get(request.connector_id); const adapter = this.adapters.get(request.connector_id); if (!adapter) throw new DomainError('ADAPTER_UNAVAILABLE', 'Adapter não está disponível; nenhuma fonte alternativa será usada.');
    const normalizedRequest: CapabilityRequest = { ...request, requested_fields: decision.normalized_limits.fields,
      pagination: { max_items: decision.normalized_limits.max_items, max_pages: decision.normalized_limits.max_pages, page_size: decision.normalized_limits.page_size } };
    this.registry.events.emit({ event: 'connector.call_started', run_id: request.run_id, task_id: request.task_id, connector_id: request.connector_id,
      attributes: { provider: connector.provider, capability: request.capability, input_bytes: Buffer.byteLength(stableJson({ resources: request.resources, query: request.query })) } });
    let response; let retries = 0;
    while (true) {
      try { response = await adapter.executeRead(normalizedRequest); break; }
      catch (error) {
        if (!(error instanceof ProviderFailure)) throw new DomainError('CONNECTOR_CALL_FAILED', 'Falha do connector; detalhe externo omitido.');
        if (error.status === 401) { this.registry.setState(connector.connector_id, 'auth_required', 'connector.authentication_required'); throw new DomainError('AUTH_EXPIRED', 'Autenticação expirada; reconecte a mesma conta.'); }
        if (error.status === 403) { this.registry.setState(connector.connector_id, 'quarantined'); throw new DomainError('SCOPE_MISMATCH', 'Permissão divergiu; connector em quarentena.'); }
        if (![429,500,502,503,504].includes(error.status) || retries >= 2) { this.registry.setState(connector.connector_id, 'degraded'); throw new DomainError(error.safeCode, 'Provider indisponível; nenhuma conta alternativa foi usada.'); }
        retries += 1; this.registry.events.emit({ event: 'connector.call_retried', run_id: request.run_id, task_id: request.task_id, connector_id: request.connector_id, attributes: { retry_count: retries, reason_code: error.safeCode } });
        const delayMs = Math.min(2_000, Math.max(error.retryAfterMs, retries * 25) + (retries * 17) % 23); await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    const guarded = response.results.slice(0, decision.normalized_limits.max_items).map(result => this.guard.normalize(result, normalizedRequest, connector,
      decision.normalized_limits.fields, decision.normalized_limits.output_token_limit, response.completeness, response.pages_fetched, response.stopped_reason));
    for (const item of guarded) { this.refs.put(item.reference); this.registry.events.emit({ event: 'external_ref.created', run_id: request.run_id, task_id: request.task_id, connector_id: request.connector_id,
      attributes: { external_ref_id: item.reference.external_ref_id, object_id_hash: item.reference.object_id_hash } }); }
    const receipt = this.consents.matching(request, integrationPolicyHash); this.manifests.write({ run_id: request.run_id, task_id: request.task_id, connectors: [connector], capabilities: [request.capability], receipts: receipt ? [receipt] : [], refs: guarded.map(item => item.reference) });
    this.registry.events.emit({ event: 'connector.call_completed', run_id: request.run_id, task_id: request.task_id, connector_id: request.connector_id,
      attributes: { provider: connector.provider, capability: request.capability, output_bytes: Buffer.byteLength(stableJson(guarded.map(item => ({ fields: item.normalized.selected_fields, content_hash: item.reference.content_hash })))), pages: response.pages_fetched, count: guarded.length, retry_count: retries, latency_ms: Date.now() - started, status: response.completeness } });
    return { decision, results: guarded.map(item => item.normalized), external_refs: guarded.map(item => item.reference), context: guarded.map(item => item.envelope), completeness: guarded.some(item => item.normalized.completeness === 'partial') ? 'partial' : response.completeness };
  }
  createDraftIntent(input: Parameters<DraftIntentStore['create']>[0]): DraftIntent {
    const intent = this.drafts.create(input); this.registry.events.emit({ event: 'draft.intent_created', run_id: input.run_id, task_id: input.task_id, connector_id: input.connector_id,
      attributes: { payload_hash: intent.payload_hash, status: intent.status } }); return intent;
  }
  async createExternalDraft(intentId: string, request: CapabilityRequest): Promise<DraftIntent> {
    const intent = this.drafts.get(intentId); if (intent.mode !== 'external' || !intent.connector_id || intent.connector_id !== request.connector_id || intent.payload_hash !== request.payload_hash) throw new DomainError('PAYLOAD_CHANGED', 'Intent e payload aprovado não conferem.');
    const connector = this.registry.get(request.connector_id); if (intent.payload.from_account !== connector.account_alias) throw new DomainError('ACCOUNT_MISMATCH', 'Conta remetente não corresponde ao connector aprovado.');
    for (const refId of intent.payload.source_external_ref_ids) if (this.refs.get(refId).connector_id !== request.connector_id) throw new DomainError('EGRESS_ROUTE_DENIED', 'Egress cross-connector não está autorizado nesta alpha.');
    const decision = this.check(request); if (decision.decision !== 'ALLOW') throw new DomainError(decision.reason_codes[0] ?? 'CONSENT_REQUIRED', 'Draft externo não autorizado.');
    const adapter = this.adapters.get(request.connector_id) as MailConnectorPort | undefined; if (!adapter?.executeReversibleWrite) throw new DomainError('DRAFT_UNAVAILABLE', 'Adapter não separa draft de send; use draft local.');
    const receipt = this.consents.matching(request, integrationPolicyHash); if (!receipt || receipt.payload_hash !== intent.payload_hash) throw new DomainError('PAYLOAD_CHANGED', 'Aprovação não corresponde ao payload atual.');
    const idempotencyKey = hash(stableJson({ task_id: intent.task_id, payload_hash: intent.payload_hash, receipt_id: receipt.receipt_id }));
    const response = await adapter.executeReversibleWrite(request, intent.payload, idempotencyKey);
    const next = this.drafts.update(intentId, current => ({ ...current, status: 'created', consent_receipt_id: receipt.receipt_id, provider_draft_id: response.draft_id }));
    this.manifests.write({ run_id: request.run_id, task_id: request.task_id, connectors: [connector], capabilities: [request.capability], receipts: [receipt], refs: [],
      writes: [{ capability: request.capability, payload_hash: intent.payload_hash, receipt_id: receipt.receipt_id }] });
    this.registry.events.emit({ event: 'draft.created', run_id: request.run_id, task_id: request.task_id, connector_id: request.connector_id, attributes: { capability: request.capability, payload_hash: intent.payload_hash, receipt_id: receipt.receipt_id } }); return next;
  }
  async revalidate(refId: string): Promise<{ status: string; reference: ReturnType<ExternalRefStore['get']> }> {
    const reference = this.refs.get(refId); const adapter = this.adapters.get(reference.connector_id); if (!adapter) return { status: 'offline', reference };
    const revision = await adapter.getRevision(reference.object_id_hash); const status = revision === null ? 'not_found' : revision === reference.revision ? 'not_modified' : 'changed';
    const updated = status === 'not_modified' ? reference : this.refs.updateStatus(refId, status === 'changed' ? 'changed' : 'not_found', revision ?? undefined);
    this.registry.events.emit({ event: status === 'changed' ? 'external_ref.changed' : 'external_ref.revalidated', run_id: null, task_id: null, connector_id: reference.connector_id, attributes: { external_ref_id: refId, status } }); return { status, reference: updated };
  }
  privacyPurge(connectorId: string): { references_removed: number; receipts_removed: number; draft_intents_removed: number } {
    return { references_removed: this.refs.purgeConnector(connectorId), receipts_removed: this.consents.purgeConnector(connectorId), draft_intents_removed: this.drafts.purgeConnector(connectorId) };
  }
}
