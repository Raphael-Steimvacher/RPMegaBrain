import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContextBundle, MemoryRecord, RetrievalItem, RetrievalReasonCode, RetrievalRequest, SourceSearchResult } from '../../domain/v2/contracts.js';
import type { WarmMemoryStorePort } from '../../domain/v2/memory-store.js';
import type { FullSourcePort } from '../../domain/v2/source-registry.js';
import { memoryContentHash } from '../../domain/v2/integrity.js';
import { DomainError } from '../../domain/policy.js';
import { hash } from '../../infrastructure/hashing.js';
import { RunStore } from '../../infrastructure/run-store.js';
import { atomicWrite } from '../../infrastructure/v2/atomic.js';
import { EventLogV2 } from '../../infrastructure/v2/events.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../infrastructure/v2/paths.js';
import { validateV2 } from '../../infrastructure/v2/validation.js';

const sensitivityRank = { public: 0, personal: 1, confidential: 2 } as const;
const usefulKinds: Record<string, string[]> = { planning: ['decision','convention','verified_fact','preference'], debugging: ['correction','pattern','verified_fact','decision'], 'branch-review': ['convention','decision','correction'], definition: ['decision','verified_fact','correction'] };
function estimateTokens(content: string): number { return Math.max(1, Math.ceil(content.length / 4)); }
function terms(request: RetrievalRequest): string[] {
  const fromGoal = request.goal.normalize('NFKC').toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}_-]{3,}/gu) ?? [];
  return [...new Set([...request.explicit_terms.map(t => t.normalize('NFKC').toLocaleLowerCase('pt-BR')), ...fromGoal])].slice(0, 30);
}
function warmFactors(record: MemoryRecord, request: RetrievalRequest, queryTerms: string[]): string[] {
  const text = `${record.subject} ${record.statement} ${record.tags.join(' ')}`.normalize('NFKC').toLocaleLowerCase('pt-BR'); const factors: string[] = [];
  if (request.explicit_refs.includes(record.memory_id)) factors.push('explicit_reference');
  if (request.active_repository && record.scope_id === `repository:${request.active_repository}`) factors.push('repository_scope_exact');
  if (record.scope_id === `task:${request.task_id}`) factors.push('task_scope_exact');
  if (queryTerms.some(term => text.includes(term))) factors.push('term_match');
  if ((usefulKinds[request.workflow] ?? []).includes(record.kind)) factors.push('workflow_kind');
  if (record.confidence === 'confirmed') factors.push('confirmed');
  return factors.length ? factors : ['fts_match'];
}
function fullFactors(item: SourceSearchResult, request: RetrievalRequest): string[] {
  const factors = [...item.rank_factors];
  if (request.explicit_refs.some(ref => ref === item.logical_path || ref === `${item.source_id}:${item.logical_path}`)) factors.unshift('explicit_reference');
  if (request.active_files.includes(item.logical_path)) factors.push('active_file_exact');
  return [...new Set(factors)];
}
function compareFactors(a: string[], b: string[], tieA: string, tieB: string): number {
  const priority = ['explicit_reference','active_file_exact','repository_scope_exact','task_scope_exact','term_match','workflow_kind','confirmed','authoritative_source','maintained_source','supported'];
  for (const factor of priority) { const delta = Number(b.includes(factor)) - Number(a.includes(factor)); if (delta) return delta; }
  return tieA.localeCompare(tieB, 'en');
}
export class ContextBundleStore {
  readonly stateRoot: string;
  constructor(stateRoot?: string) { this.stateRoot = new RunStore(stateRoot).root; }
  private directory(profileId: string, runId: string): string { assertIdentifier(profileId, 'profile_id'); assertIdentifier(runId, 'run_id'); return join(this.stateRoot, 'profiles', profileId, 'runs', runId, 'context'); }
  save(bundle: ContextBundle): void { const dir = this.directory(bundle.profile_id, bundle.run_id); ensurePrivateDirectory(dir); atomicWrite(join(dir, `${bundle.retrieval_id}.json`), JSON.stringify(validateV2('context-bundle', bundle), null, 2) + '\n'); atomicWrite(join(dir, 'current'), `${bundle.retrieval_id}\n`); }
  loadCurrent(profileId: string, runId: string): ContextBundle {
    const dir = this.directory(profileId, runId); const current = join(dir, 'current');
    if (!existsSync(current)) throw new DomainError('CONTEXT_NOT_FOUND', 'Run sem context bundle.');
    const id = readFileSync(current, 'utf8').trim(); assertIdentifier(id, 'retrieval_id');
    return validateV2('context-bundle', JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')));
  }
}
export class RetrievalPipeline {
  constructor(private readonly warm: WarmMemoryStorePort, private readonly full: FullSourcePort | null,
    private readonly bundles: ContextBundleStore, private readonly events: EventLogV2) {}
  build(input: RetrievalRequest): ContextBundle {
    const request = validateV2<RetrievalRequest>('retrieval-request', input);
    if (request.profile_id !== this.events.profileId) throw new DomainError('PROFILE_MISMATCH', 'Pedido de recuperação pertence a outro perfil.');
    this.events.emit({ event: 'retrieval.started', run_id: request.run_id, task_id: request.task_id, checkpoint_id: null, attributes: { retrieval_id: request.retrieval_id, mode: request.memory_mode, workflow: request.workflow } });
    const queryTerms = terms(request); const query = queryTerms.join(' ');
    this.events.emit({ event: 'retrieval.query_built', run_id: request.run_id, task_id: request.task_id, checkpoint_id: null, attributes: { retrieval_id: request.retrieval_id, count: queryTerms.length } });
    const rejected: ContextBundle['rejected'] = []; const warmCandidates: { item: RetrievalItem; factors: string[] }[] = [];
    const fullCandidates: { item: RetrievalItem; factors: string[]; sourceId: string }[] = []; const sourceSnapshots: ContextBundle['source_snapshots'] = [];
    let memorySnapshotId: string | null = null;
    if (request.memory_mode !== 'disabled') {
      const snapshot = this.warm.snapshot(); memorySnapshotId = snapshot.snapshot_id;
      const explicitRecords: MemoryRecord[] = [];
      for (const ref of request.explicit_refs.filter(value => value.startsWith('mem_'))) {
        try { explicitRecords.push(this.warm.get(ref)); } catch { rejected.push({ item_id: ref, source_id: 'warm', reason_code: 'SOURCE_UNAVAILABLE' }); }
      }
      const records = [...new Map([...explicitRecords, ...this.warm.search(query, request)].map(record => [record.memory_id, record])).values()];
      for (const record of records) {
        let reason: RetrievalReasonCode | null = null;
        if (record.profile_id !== request.profile_id) reason = 'PROFILE_MISMATCH';
        else if (!request.allowed_kinds.includes(record.kind)) reason = 'STATUS_INACTIVE';
        else if (sensitivityRank[record.sensitivity] > sensitivityRank[request.max_sensitivity]) reason = 'SENSITIVITY_BLOCKED';
        else if (record.status !== 'active') reason = 'STATUS_INACTIVE';
        else if (record.valid_until && record.valid_until <= request.reference_time) reason = 'EXPIRED';
        else if (record.conflicts_with.length) reason = 'CONFLICTED';
        else if (memoryContentHash(record.statement, record.limits) !== record.content_hash) reason = 'HASH_INVALID';
        if (reason) { rejected.push({ item_id: record.memory_id, source_id: 'warm', reason_code: reason }); continue; }
        const factors = warmFactors(record, request, queryTerms); const content = `${record.statement}\n\nLimites: ${record.limits}`;
        warmCandidates.push({ factors, item: { retrieval_item_id: `ritem_${hash(`${request.retrieval_id}:${record.memory_id}:${record.revision}`).slice(7, 31)}`, type: 'warm', item_id: record.memory_id,
          revision: String(record.revision), content, profile_id: record.profile_id, scope_id: record.scope_id, source_ref: `memory:${record.memory_id}@${record.revision}`,
          source_hash: record.content_hash, valid_until: record.valid_until, sensitivity: record.sensitivity, confidence: record.confidence,
          reason_selected: factors.join(','), rank_factors: factors, estimated_tokens: estimateTokens(content), data_not_instructions: true } });
      }
    }
    if ((request.memory_mode === 'full' || request.memory_mode === 'shadow') && this.full) {
      if (this.full.document().profile_id !== request.profile_id) throw new DomainError('PROFILE_MISMATCH', 'Registry FULL pertence a outro perfil.');
      for (const source of this.full.list()) {
        if (!request.allowed_sources.includes(source.source_id)) { rejected.push({ item_id: source.source_id, source_id: source.source_id, reason_code: 'SOURCE_NOT_ALLOWED' }); continue; }
        const foundById = new Map<string, SourceSearchResult>(); let finalSnapshot: ContextBundle['source_snapshots'][number] | null = null;
        const sourceQueries = [...new Set([...request.explicit_terms, ...queryTerms])].filter(Boolean).slice(0, 5);
        for (const sourceQuery of sourceQueries.length ? sourceQueries : [request.goal]) {
          const response = this.full.search(source.source_id, sourceQuery, request.workflow, request.max_sensitivity);
          rejected.push(...response.rejected); if (response.snapshot) finalSnapshot = response.snapshot;
          response.items.forEach(item => foundById.set(item.item_id, item));
        }
        if (finalSnapshot) sourceSnapshots.push({ ...finalSnapshot, selected_hashes: [...new Set([...foundById.values()].map(i => i.source_hash))].sort() });
        for (const found of foundById.values()) {
          const factors = fullFactors(found, request);
          fullCandidates.push({ sourceId: source.source_id, factors, item: { retrieval_item_id: `ritem_${hash(`${request.retrieval_id}:${found.item_id}`).slice(7, 31)}`, type: 'full', item_id: found.item_id,
            revision: found.revision, content: found.content, profile_id: found.profile_id, scope_id: found.scope_id,
            source_ref: `${found.source_id}:${found.logical_path}:${found.line}`, source_hash: found.source_hash, valid_until: null,
            sensitivity: found.sensitivity, confidence: found.confidence, reason_selected: factors.join(','), rank_factors: factors,
            estimated_tokens: estimateTokens(found.content), data_not_instructions: true } });
        }
      }
    }
    warmCandidates.sort((a, b) => compareFactors(a.factors, b.factors, a.item.item_id, b.item.item_id));
    fullCandidates.sort((a, b) => compareFactors(a.factors, b.factors, a.item.item_id, b.item.item_id));
    const selected: RetrievalItem[] = []; const seen = new Set<string>(); const sourceCounts = new Map<string, number>();
    let used = 0; const budget = Math.floor(request.budget_tokens * 0.2);
    const consider = (candidate: { item: RetrievalItem; sourceId?: string }, limitReached: boolean) => {
      const item = candidate.item; const sourceId = candidate.sourceId ?? 'warm';
      let reason: RetrievalReasonCode | null = limitReached ? 'LOW_RELEVANCE' : null;
      if (!reason && seen.has(item.source_hash)) reason = 'DUPLICATE';
      if (!reason && candidate.sourceId && (sourceCounts.get(sourceId) ?? 0) >= request.max_per_source && !item.rank_factors.includes('explicit_reference')) reason = 'LOW_RELEVANCE';
      if (!reason && used + item.estimated_tokens > budget) reason = 'BUDGET_EXCEEDED';
      if (reason) { rejected.push({ item_id: item.item_id, source_id: sourceId, reason_code: reason }); return; }
      selected.push(validateV2('retrieval-item', item)); seen.add(item.source_hash); used += item.estimated_tokens; sourceCounts.set(sourceId, (sourceCounts.get(sourceId) ?? 0) + 1);
    };
    warmCandidates.forEach((c, i) => consider(c, i >= request.max_warm));
    fullCandidates.forEach((c, i) => consider(c, i >= request.max_full));
    const bundle: ContextBundle = validateV2('context-bundle', { schema_version: 1, retrieval_id: request.retrieval_id, run_id: request.run_id, task_id: request.task_id,
      profile_id: request.profile_id, memory_mode: request.memory_mode, memory_snapshot_id: memorySnapshotId, source_snapshots: sourceSnapshots,
      selected, rejected, estimated_tokens: used, injected: request.memory_mode === 'warm' || request.memory_mode === 'full', created_at: new Date().toISOString() });
    this.bundles.save(bundle);
    selected.forEach((item, index) => this.events.emit({ event: item.type === 'warm' ? 'memory.selected' : 'source.selected', run_id: request.run_id, task_id: request.task_id, checkpoint_id: null,
      attributes: { retrieval_id: request.retrieval_id, memory_id: item.type === 'warm' ? item.item_id : undefined, source_id: item.type === 'full' ? item.source_ref.split(':')[0] : undefined, rank_position: index + 1, budget_tokens_estimated: item.estimated_tokens } }));
    rejected.forEach(item => this.events.emit({ event: 'context.item_rejected', run_id: request.run_id, task_id: request.task_id, checkpoint_id: null, attributes: { retrieval_id: request.retrieval_id, source_id: item.source_id, reason_code: item.reason_code } }));
    this.events.emit({ event: 'context.bundle_built', run_id: request.run_id, task_id: request.task_id, checkpoint_id: null, attributes: { retrieval_id: request.retrieval_id, count: selected.length, budget_tokens_estimated: used, injected: bundle.injected } });
    this.events.emit({ event: 'retrieval.completed', run_id: request.run_id, task_id: request.task_id, checkpoint_id: null, attributes: { retrieval_id: request.retrieval_id, count: selected.length } });
    return bundle;
  }
}
