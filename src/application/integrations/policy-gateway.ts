import { randomUUID } from 'node:crypto';
import type { CapabilityRequest, ConnectorBinding, IntegrationReasonCode, PolicyDecision, ToolCatalog } from '../../domain/v3/contracts.js';
import { capabilityCatalog, structurallyForbiddenCapabilities } from '../../domain/v3/catalog.js';
import type { ConsentStore } from '../../adapters/filesystem/v3/consent-store.js';
import { hash, stableJson } from '../../infrastructure/hashing.js';
import { validateV3 } from '../../infrastructure/v3/validation.js';

const sensitivity = { public: 0, personal: 1, confidential: 2 } as const;
const resourceAliases: Record<string, string> = { repository: 'repositories', project: 'projects', folder: 'folders', mailbox: 'mailboxes', drive: 'drives', host: 'hosts' };
const fields: Record<string, string[]> = {
  'scm.repository.list': ['name','owner','visibility','default_branch','updated_at'],
  'scm.repository.read': ['name','owner','visibility','default_branch','description','updated_at'],
  'scm.code.search': ['path','line','fragment','revision'],
  'scm.issue.read': ['title','body','state','labels','updated_at','comments'],
  'scm.pull_request.read': ['title','body','state','base','head','reviews','checks','updated_at'],
  'scm.pipeline.read': ['status','ref','jobs','updated_at'],
  'issue_tracker.issue.search': ['key','summary','status','updated_at'],
  'issue_tracker.issue.read': ['key','summary','description','acceptance_criteria','status','labels','components','comments','updated_at'],
  'issue_tracker.project.read': ['key','name','lead','updated_at'],
  'mail.thread.search': ['thread_id','subject','from','date','labels','has_attachments'],
  'mail.thread.read': ['thread_id','subject','from','to','date','body','has_attachments'],
  'mail.message.read': ['message_id','subject','from','to','date','body','has_attachments'],
  'drive.file.search': ['file_id','name','mime_type','modified_time','owners','has_attachments'],
  'drive.file.metadata.read': ['file_id','name','mime_type','modified_time','owners','size'],
  'drive.file.content.read': ['file_id','name','mime_type','modified_time','revision','content'],
  'mail.draft.create': ['draft_id','revision'], 'mail.draft.update': ['draft_id','revision'],
};

export const integrationPolicyHash = hash(stableJson({ version: 1, capabilities: [...capabilityCatalog.values()], forbidden: [...structurallyForbiddenCapabilities].sort(), fields }));

function decision(request: CapabilityRequest, outcome: PolicyDecision['decision'], reasons: IntegrationReasonCode[], limits?: Partial<PolicyDecision['normalized_limits']>): PolicyDecision {
  const definition = capabilityCatalog.get(request.capability);
  const value: PolicyDecision = { schema_version: 1, decision_id: `idec_${randomUUID()}`, request_id: request.request_id, decision: outcome, reason_codes: reasons,
    normalized_limits: { max_items: limits?.max_items ?? definition?.max_items ?? 1, max_pages: limits?.max_pages ?? definition?.max_pages ?? 1,
      page_size: limits?.page_size ?? definition?.page_size ?? 1, fields: limits?.fields ?? [], output_token_limit: limits?.output_token_limit ?? definition?.output_token_limit ?? 1 },
    policy_hash: integrationPolicyHash, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() };
  return validateV3<PolicyDecision>('policy-decision', value);
}
function resourcesAllowed(connector: ConnectorBinding, request: CapabilityRequest): boolean {
  const configured = connector.resource_allowlist; const keys = Object.keys(configured);
  if (!keys.length) return false;
  let constrained = false;
  for (const [requestKey, raw] of Object.entries(request.resources)) {
    const configuredKey = resourceAliases[requestKey] ?? requestKey; const allowed = configured[configuredKey];
    if (!allowed) continue; constrained = true; const requested = Array.isArray(raw) ? raw : [raw];
    if (!requested.every(item => allowed.includes(item))) return false;
  }
  return constrained;
}
function consentRequired(connector: ConnectorBinding, effect: string): boolean {
  if (effect === 'W1' || effect === 'R2') return true;
  return connector.consent_mode !== 'standing_read';
}

export class PolicyGateway {
  evaluate(input: unknown, connector: ConnectorBinding | null, catalog: ToolCatalog | null, consents: ConsentStore, integrationMode: 'disabled' | 'shadow' | 'enabled'): PolicyDecision {
    let request: CapabilityRequest;
    try { request = validateV3<CapabilityRequest>('capability-request', input); }
    catch { request = { schema_version: 1, request_id: 'ireq_invalid', run_id: 'invalid', task_id: 'invalid', profile_id: 'invalid', workflow: 'invalid', connector_id: 'invalid', capability: 'invalid', purpose: '', resources: {}, query: null, requested_fields: [], pagination: { page_size: 1, max_pages: 1, max_items: 1 }, sensitivity_ceiling: 'public', destination: 'current_context', payload_hash: null, created_at: new Date().toISOString() }; return decision(request, 'DENY', ['CAPABILITY_DENIED']); }
    if (integrationMode === 'disabled') return decision(request, 'DENY', ['INTEGRATIONS_DISABLED']);
    if (!connector || connector.profile_id !== request.profile_id || connector.connector_id !== request.connector_id) return decision(request, 'DENY', ['PROFILE_MISMATCH']);
    if (connector.state === 'quarantined') return decision(request, 'QUARANTINE', ['CONNECTOR_NOT_HEALTHY']);
    if (connector.state === 'degraded') return decision(request, 'DEFER', ['CONNECTOR_NOT_HEALTHY']);
    if (connector.state === 'auth_required') return decision(request, 'DEFER', ['AUTH_EXPIRED']);
    if (connector.state !== 'healthy' || !connector.identity_verified) return decision(request, 'DENY', ['CONNECTOR_NOT_HEALTHY']);
    if (stableJson([...connector.expected_scopes].sort()) !== stableJson([...connector.granted_scopes].sort())) return decision(request, 'QUARANTINE', ['SCOPE_MISMATCH']);
    const definition = capabilityCatalog.get(request.capability);
    if (!definition) return decision(request, 'DENY', [structurallyForbiddenCapabilities.has(request.capability) ? 'EFFECT_HARD_DENIED' : 'CAPABILITY_UNKNOWN']);
    if (!connector.capability_allowlist.includes(definition.capability)) return decision(request, 'DENY', ['CAPABILITY_DENIED']);
    if (!catalog || catalog.catalog_hash !== connector.catalog_hash) return decision(request, 'QUARANTINE', ['TOOL_CATALOG_DRIFT']);
    const tool = catalog.entries.find(entry => entry.mapped_capability === request.capability && entry.enabled && entry.review_status === 'approved');
    if (!tool || tool.effect_class !== definition.effect_class) return decision(request, tool ? 'QUARANTINE' : 'DENY', [tool ? 'TOOL_CATALOG_DRIFT' : 'TOOL_NOT_ALLOWLISTED']);
    if (!connector.allowed_workflows.includes(request.workflow)) return decision(request, 'DENY', ['WORKFLOW_NOT_ALLOWED']);
    if (!request.purpose.trim()) return decision(request, 'DENY', ['PURPOSE_MISSING']);
    if (!resourcesAllowed(connector, request)) return decision(request, 'DENY', ['RESOURCE_NOT_ALLOWLISTED']);
    if (sensitivity[request.sensitivity_ceiling] > sensitivity[connector.max_sensitivity]) return decision(request, 'DENY', ['SENSITIVITY_BLOCKED']);
    if (request.destination !== 'current_context' && request.destination !== 'hot_reference' && !request.destination.startsWith('draft:')) return decision(request, 'DENY', ['EGRESS_ROUTE_DENIED']);
    if (definition.effect_class === 'W1' && (!connector.draft_enabled || !request.destination.startsWith('draft:'))) return decision(request, 'DENY', ['DRAFT_DISABLED']);
    if (connector.consent_mode === 'denied') return decision(request, 'DENY', ['CAPABILITY_DENIED']);
    if (definition.effect_class === 'W1' && !request.payload_hash) return decision(request, 'PROMPT', ['CONSENT_REQUIRED']);
    const receipt = consents.matching(request, integrationPolicyHash);
    if (definition.effect_class === 'W1' && !receipt && consents.list().some(item => item.status === 'active' && item.connector_id === request.connector_id && item.capability === request.capability && item.run_id === request.run_id && item.payload_hash !== request.payload_hash)) return decision(request, 'PROMPT', ['PAYLOAD_CHANGED']);
    if (!receipt && consents.list().some(item => item.connector_id === request.connector_id && item.capability === request.capability && item.purpose === request.purpose && new Date(item.expires_at) <= new Date())) return decision(request, 'PROMPT', ['CONSENT_EXPIRED']);
    if (consentRequired(connector, definition.effect_class) && !receipt) return decision(request, 'PROMPT', ['CONSENT_REQUIRED']);
    const allowedFields = fields[request.capability] ?? []; const selectedFields = request.requested_fields.length ? request.requested_fields.filter(field => allowedFields.includes(field)) : allowedFields;
    const maxItems = Math.min(request.pagination.max_items, definition.max_items); const maxPages = Math.min(request.pagination.max_pages, definition.max_pages); const pageSize = Math.min(request.pagination.page_size, definition.page_size, maxItems);
    const reasons: IntegrationReasonCode[] = ['PROFILE_MATCH','CAPABILITY_ALLOWLISTED','RESOURCE_ALLOWLISTED']; if (receipt) reasons.push('CONSENT_VALID');
    if (maxItems !== request.pagination.max_items || maxPages !== request.pagination.max_pages || pageSize !== request.pagination.page_size) reasons.push('PAGINATION_LIMIT');
    if (integrationMode === 'shadow') return decision(request, 'DENY', [...reasons, 'SHADOW_MODE'], { max_items: maxItems, max_pages: maxPages, page_size: pageSize, fields: selectedFields, output_token_limit: definition.output_token_limit });
    return decision(request, 'ALLOW', reasons, { max_items: maxItems, max_pages: maxPages, page_size: pageSize, fields: selectedFields, output_token_limit: definition.output_token_limit });
  }
}
