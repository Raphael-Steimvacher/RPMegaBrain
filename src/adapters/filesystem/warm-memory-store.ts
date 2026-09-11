import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseDocument, stringify } from 'yaml';
import type { CandidateInput, ForgetResult, ReviewDecision, ReviewResult, WarmMemoryStorePort } from '../../domain/v2/memory-store.js';
import type { MemoryCandidate, MemoryRecord, MemorySnapshot, RetrievalRequest } from '../../domain/v2/contracts.js';
import { makeMemorySnapshot, memoryContentHash } from '../../domain/v2/integrity.js';
import { DomainError } from '../../domain/policy.js';
import { RunStore } from '../../infrastructure/run-store.js';
import { atomicWrite, withDirectoryLock } from '../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../infrastructure/v2/paths.js';
import { detectedSecretCodes } from '../../infrastructure/v2/secrets.js';
import { EventLogV2 } from '../../infrastructure/v2/events.js';
import { validateV2 } from '../../infrastructure/v2/validation.js';
import { SqliteWarmIndex } from '../sqlite/warm-index.js';
import { defaultCacheRoot } from '../../infrastructure/v2/paths.js';

function normalize(value: string): string { return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'); }
function unique(values: string[]): string[] { return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en')); }
function serializeRecord(record: MemoryRecord): string {
  const { statement, limits, ...frontmatter } = record;
  return `---\n${stringify(frontmatter).trim()}\n---\n\n# ${record.kind}\n\n${statement.trim()}\n\n## Limites\n\n${limits.trim()}\n`;
}
function parseRecord(raw: string): MemoryRecord {
  if (!raw.startsWith('---\n')) throw new DomainError('CORRUPT_MEMORY', 'Memória sem frontmatter.');
  const end = raw.indexOf('\n---\n', 4);
  if (end < 0) throw new DomainError('CORRUPT_MEMORY', 'Frontmatter incompleto.');
  const metaDoc = parseDocument(raw.slice(4, end), { uniqueKeys: true });
  if (metaDoc.errors.length) throw new DomainError('CORRUPT_MEMORY', 'Frontmatter inválido.');
  const body = raw.slice(end + 5).trim();
  const limitsMarker = '\n## Limites\n';
  const limitsAt = body.indexOf(limitsMarker);
  if (limitsAt < 0) throw new DomainError('CORRUPT_MEMORY', 'Seção Limites ausente.');
  const firstBreak = body.indexOf('\n\n');
  if (firstBreak < 0 || firstBreak >= limitsAt) throw new DomainError('CORRUPT_MEMORY', 'Afirmação ausente.');
  const statement = body.slice(firstBreak + 2, limitsAt).trim();
  const limits = body.slice(limitsAt + limitsMarker.length).trim();
  return validateV2<MemoryRecord>('memory-record', { ...metaDoc.toJS({ maxAliasCount: 20 }), statement, limits });
}
export class FilesystemWarmMemoryStore implements WarmMemoryStorePort {
  readonly stateRoot: string;
  readonly memoryRoot: string;
  readonly events: EventLogV2;
  readonly index: SqliteWarmIndex;
  constructor(stateRoot: string | undefined, readonly profileId: string, cacheRoot = defaultCacheRoot()) {
    assertIdentifier(profileId, 'profile_id');
    this.stateRoot = new RunStore(stateRoot).root;
    this.memoryRoot = join(this.stateRoot, 'profiles', profileId, 'memory', 'warm');
    for (const dir of ['items','revisions','candidates','conflicts','snapshots','deletions']) ensurePrivateDirectory(join(this.memoryRoot, dir));
    ensurePrivateDirectory(join(this.stateRoot, 'locks'));
    this.events = new EventLogV2(this.stateRoot, profileId);
    this.index = new SqliteWarmIndex(join(cacheRoot, 'profiles', profileId, 'warm-index.sqlite'), profileId);
  }
  propose(input: CandidateInput): MemoryCandidate {
    if (input.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Candidato pertence a outro perfil.');
    if (detectedSecretCodes(`${input.statement}\n${input.limits}`).length) {
      this.events.emit({ event: 'secret.detected', run_id: input.source_run_ids[0] ?? null, task_id: input.task_id, checkpoint_id: null, attributes: { reason_code: 'MEMORY_CANDIDATE' } });
      throw new DomainError('SECRET_DETECTED', 'Conteúdo sensível bloqueou a criação do candidato.');
    }
    const candidate: MemoryCandidate = validateV2('memory-candidate', {
      ...structuredClone(input), schema_version: 1, candidate_id: input.candidate_id ?? `cand_${randomUUID()}`,
      duplicate_candidates: this.listRecords().filter(r => r.scope_id === input.scope_id && r.kind === input.kind && normalize(r.statement) === normalize(input.statement)).map(r => r.memory_id),
      conflict_candidates: this.listRecords().filter(r => r.scope_id === input.scope_id && r.subject === input.subject && normalize(r.statement) !== normalize(input.statement) && r.status === 'active').map(r => r.memory_id),
      status: 'pending', created_at: new Date().toISOString(), statement_hash: memoryContentHash(input.statement, input.limits),
    });
    const path = join(this.memoryRoot, 'candidates', `${candidate.candidate_id}.json`);
    if (existsSync(path)) throw new DomainError('CANDIDATE_EXISTS', 'Candidato já existe.');
    writeFileSync(path, JSON.stringify(candidate, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    this.events.emit({ event: 'memory.candidate_created', run_id: candidate.source_run_ids[0] ?? null, task_id: candidate.task_id, checkpoint_id: null, attributes: { candidate_id: candidate.candidate_id } });
    return candidate;
  }
  private candidatePath(id: string): string { assertIdentifier(id, 'candidate_id'); return join(this.memoryRoot, 'candidates', `${id}.json`); }
  private readCandidate(id: string): MemoryCandidate {
    const path = this.candidatePath(id); if (!existsSync(path)) throw new DomainError('CANDIDATE_NOT_FOUND', 'Candidato não encontrado.');
    return validateV2('memory-candidate', JSON.parse(readFileSync(path, 'utf8')));
  }
  listCandidates(): MemoryCandidate[] {
    return readdirSync(join(this.memoryRoot, 'candidates')).filter(n => n.endsWith('.json')).map(n => this.readCandidate(n.slice(0, -5)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.candidate_id.localeCompare(b.candidate_id));
  }
  private recordPath(id: string): string { assertIdentifier(id, 'memory_id'); return join(this.memoryRoot, 'items', `${id}.md`); }
  get(id: string): MemoryRecord {
    const path = this.recordPath(id); if (!existsSync(path)) throw new DomainError('MEMORY_NOT_FOUND', 'Memória não encontrada.');
    const record = parseRecord(readFileSync(path, 'utf8'));
    if (record.profile_id !== this.profileId || record.memory_id !== id || memoryContentHash(record.statement, record.limits) !== record.content_hash) throw new DomainError('CORRUPT_MEMORY', 'Identidade ou hash da memória não confere.');
    return record;
  }
  listRecords(): MemoryRecord[] {
    const records: MemoryRecord[] = [];
    for (const name of readdirSync(join(this.memoryRoot, 'items')).filter(n => n.endsWith('.md'))) {
      try { records.push(this.get(name.slice(0, -3))); } catch { /* doctor reports invalid items; retrieval excludes them */ }
    }
    return records.sort((a, b) => a.memory_id.localeCompare(b.memory_id, 'en'));
  }
  private writeRecord(record: MemoryRecord): MemoryRecord {
    validateV2('memory-record', record);
    if (memoryContentHash(record.statement, record.limits) !== record.content_hash) throw new DomainError('HASH_INVALID', 'Hash da memória não corresponde ao conteúdo.');
    const revisionDir = join(this.memoryRoot, 'revisions', record.memory_id); ensurePrivateDirectory(revisionDir);
    const revisionPath = join(revisionDir, `${String(record.revision).padStart(8, '0')}.md`);
    if (existsSync(revisionPath)) throw new DomainError('REVISION_EXISTS', 'Revisão de memória já existe.');
    const raw = serializeRecord(record);
    writeFileSync(revisionPath, raw, { flag: 'wx', mode: 0o600 });
    atomicWrite(this.recordPath(record.memory_id), raw);
    return this.get(record.memory_id);
  }
  private updateCandidate(candidate: MemoryCandidate): void { atomicWrite(this.candidatePath(candidate.candidate_id), JSON.stringify(validateV2('memory-candidate', candidate), null, 2) + '\n'); }
  private updateIndex(): void {
    try {
      const count = this.index.rebuild(this.listRecords().filter(r => r.status === 'active' && (!r.valid_until || r.valid_until > new Date().toISOString())));
      this.events.emit({ event: 'memory.index_rebuilt', run_id: null, task_id: null, checkpoint_id: null, attributes: { index_count: count } });
    } catch { this.events.emit({ event: 'memory.index_unavailable', run_id: null, task_id: null, checkpoint_id: null, attributes: { reason_code: 'REBUILD_FAILED' } }); }
  }
  review(candidateId: string, decision: ReviewDecision): ReviewResult {
    return withDirectoryLock(join(this.stateRoot, 'locks', `memory-${this.profileId}`), () => {
      const candidate = this.readCandidate(candidateId);
      if (candidate.status !== 'pending') throw new DomainError('CANDIDATE_DECIDED', 'Candidato já possui decisão.');
      if (candidate.statement_hash !== decision.expected_hash) throw new DomainError('STALE_APPROVAL', 'Hash do candidato mudou.');
      const now = new Date().toISOString();
      if (decision.decision === 'reject' || decision.decision === 'defer') {
        candidate.status = decision.decision === 'reject' ? 'rejected' : 'deferred';
        candidate.decision = { decided_at: now, decision: decision.decision === 'reject' ? 'rejected' : 'deferred', reason: decision.reason ?? null };
        this.updateCandidate(candidate);
        this.events.emit({ event: decision.decision === 'reject' ? 'memory.rejected' : 'persistence.denied', run_id: candidate.source_run_ids[0] ?? null, task_id: candidate.task_id, checkpoint_id: null,
          attributes: { candidate_id: candidate.candidate_id, decision: decision.decision } });
        return { candidate, record: null, duplicate_of: null, conflict_ids: [] };
      }
      const statement = decision.decision === 'edit_and_approve' ? decision.edited_statement?.trim() : candidate.statement.trim();
      const limits = decision.edited_limits?.trim() ?? candidate.limits.trim();
      if (!statement) throw new DomainError('STATEMENT_REQUIRED', 'Aprovação editada exige statement.');
      if (detectedSecretCodes(`${statement}\n${limits}`).length) throw new DomainError('SECRET_DETECTED', 'Conteúdo sensível bloqueou a aprovação.');
      const contentHash = memoryContentHash(statement, limits);
      const records = this.listRecords();
      const duplicate = records.find(r => r.scope_id === candidate.scope_id && r.kind === candidate.kind && normalize(r.statement) === normalize(statement) && normalize(r.limits) === normalize(limits));
      let record: MemoryRecord;
      if (duplicate) {
        record = this.writeRecord({ ...duplicate, revision: duplicate.revision + 1, previous_content_hash: duplicate.content_hash,
          source_run_ids: unique([...duplicate.source_run_ids, ...candidate.source_run_ids]), evidence_refs: unique([...duplicate.evidence_refs, ...candidate.evidence_refs]),
          last_seen_at: now, verified_at: now, approval: { kind: 'memory', content_hash: contentHash, approved_by: 'user', approved_at: now }, change_reason: 'duplicate_evidence_aggregated' });
        candidate.status = 'approved'; candidate.duplicate_candidates = unique([...candidate.duplicate_candidates, duplicate.memory_id]);
        candidate.decision = { decided_at: now, decision: decision.decision === 'edit_and_approve' ? 'edited_and_approved' : 'approved', reason: decision.reason ?? null };
        this.updateCandidate(candidate); this.updateIndex();
        this.events.emit({ event: 'memory.duplicate_detected', run_id: candidate.source_run_ids[0] ?? null, task_id: candidate.task_id, checkpoint_id: null, attributes: { candidate_id: candidate.candidate_id, memory_id: record.memory_id } });
        return { candidate, record, duplicate_of: duplicate.memory_id, conflict_ids: [] };
      }
      const conflicts = records.filter(r => r.scope_id === candidate.scope_id && normalize(r.subject) === normalize(candidate.subject) && normalize(r.statement) !== normalize(statement) && r.status === 'active');
      const memoryId = `mem_${randomUUID()}`;
      record = this.writeRecord({ schema_version: 1, memory_id: memoryId, profile_id: this.profileId, scope_id: candidate.scope_id, kind: candidate.kind,
        subject: candidate.subject, status: conflicts.length ? 'quarantined' : 'active', sensitivity: candidate.sensitivity, confidence: candidate.confidence,
        created_at: now, verified_at: now, valid_until: candidate.suggested_validity.valid_until, validity_type: candidate.suggested_validity.type,
        source_run_ids: candidate.source_run_ids, evidence_refs: candidate.evidence_refs, tags: unique(decision.tags ?? []), revision: 1,
        previous_content_hash: null, content_hash: contentHash, supersedes: null, conflicts_with: conflicts.map(r => r.memory_id), statement, limits,
        last_seen_at: now, approval: { kind: 'memory', content_hash: contentHash, approved_by: 'user', approved_at: now }, change_reason: decision.reason ?? 'human_approval' });
      const conflictIds: string[] = [];
      for (const existing of conflicts) {
        const updated = this.writeRecord({ ...existing, status: 'quarantined', revision: existing.revision + 1, previous_content_hash: existing.content_hash,
          conflicts_with: unique([...existing.conflicts_with, memoryId]), last_seen_at: now, change_reason: 'conflict_detected' });
        conflictIds.push(updated.memory_id);
      }
      if (conflicts.length) {
        atomicWrite(join(this.memoryRoot, 'conflicts', `${memoryId}.json`), JSON.stringify({ schema_version: 1, profile_id: this.profileId, memory_ids: unique([memoryId, ...conflictIds]), status: 'open', created_at: now }, null, 2) + '\n');
        this.events.emit({ event: 'memory.conflict_detected', run_id: candidate.source_run_ids[0] ?? null, task_id: candidate.task_id, checkpoint_id: null, attributes: { memory_id: memoryId, count: conflicts.length } });
      }
      candidate.status = 'approved'; candidate.conflict_candidates = unique([...candidate.conflict_candidates, ...conflictIds]);
      candidate.decision = { decided_at: now, decision: decision.decision === 'edit_and_approve' ? 'edited_and_approved' : 'approved', reason: decision.reason ?? null };
      this.updateCandidate(candidate); this.updateIndex();
      this.events.emit({ event: 'memory.approved', run_id: candidate.source_run_ids[0] ?? null, task_id: candidate.task_id, checkpoint_id: null, attributes: { candidate_id: candidate.candidate_id, memory_id: memoryId, status: record.status } });
      return { candidate, record, duplicate_of: null, conflict_ids: conflictIds };
    });
  }
  history(memoryId: string): MemoryRecord[] {
    assertIdentifier(memoryId, 'memory_id'); const dir = join(this.memoryRoot, 'revisions', memoryId);
    if (!existsSync(dir)) throw new DomainError('MEMORY_NOT_FOUND', 'Histórico não encontrado.');
    return readdirSync(dir).filter(n => n.endsWith('.md')).sort().map(n => parseRecord(readFileSync(join(dir, n), 'utf8')));
  }
  private changeStatus(memoryId: string, expectedHash: string, status: MemoryRecord['status'], reason: string): MemoryRecord {
    return withDirectoryLock(join(this.stateRoot, 'locks', `memory-${this.profileId}`), () => {
      const current = this.get(memoryId); if (current.content_hash !== expectedHash) throw new DomainError('STALE_APPROVAL', 'Hash atual da memória não confere.');
      const record = this.writeRecord({ ...current, status, revision: current.revision + 1, previous_content_hash: current.content_hash,
        last_seen_at: new Date().toISOString(), change_reason: reason });
      this.updateIndex(); this.events.emit({ event: `memory.${status}`, run_id: null, task_id: null, checkpoint_id: null, attributes: { memory_id: memoryId, revision: record.revision } });
      return record;
    });
  }
  revoke(memoryId: string, expectedHash: string, reason: string): MemoryRecord { return this.changeStatus(memoryId, expectedHash, 'revoked', reason); }
  forget(memoryId: string, expectedHash: string, reason: string): ForgetResult {
    if (!reason.trim()) throw new DomainError('REASON_REQUIRED', 'Exclusão material exige motivo.');
    return withDirectoryLock(join(this.stateRoot, 'locks', `memory-${this.profileId}`), () => {
      const current = this.get(memoryId);
      if (current.content_hash !== expectedHash) throw new DomainError('STALE_APPROVAL', 'Hash atual da memória não confere.');
      let purgedCandidates = 0;
      for (const candidate of this.listCandidates()) {
        if (candidate.statement_hash === current.content_hash || candidate.duplicate_candidates.includes(memoryId) || candidate.conflict_candidates.includes(memoryId)) {
          rmSync(this.candidatePath(candidate.candidate_id)); purgedCandidates += 1;
        }
      }
      rmSync(this.recordPath(memoryId));
      rmSync(join(this.memoryRoot, 'revisions', memoryId), { recursive: true });
      for (const name of readdirSync(join(this.memoryRoot, 'conflicts')).filter(name => name.endsWith('.json'))) {
        const path = join(this.memoryRoot, 'conflicts', name);
        const conflict = JSON.parse(readFileSync(path, 'utf8')) as { memory_ids?: string[] };
        if (conflict.memory_ids?.includes(memoryId)) rmSync(path);
      }
      const deletedAt = new Date().toISOString();
      const result: ForgetResult = { memory_id: memoryId, profile_id: this.profileId, deleted_at: deletedAt, reason: reason.trim(), purged_candidates: purgedCandidates };
      atomicWrite(join(this.memoryRoot, 'deletions', `${memoryId}.json`), JSON.stringify(result, null, 2) + '\n');
      this.updateIndex();
      this.events.emit({ event: 'memory.deleted', run_id: null, task_id: null, checkpoint_id: null, attributes: { memory_id: memoryId, purged_candidates: purgedCandidates } });
      return result;
    });
  }
  expire(referenceTime = new Date().toISOString()): MemoryRecord[] {
    const expired: MemoryRecord[] = [];
    for (const record of this.listRecords()) if (record.status === 'active' && record.valid_until && record.valid_until <= referenceTime) expired.push(this.changeStatus(record.memory_id, record.content_hash, 'expired', 'validity_elapsed'));
    return expired;
  }
  snapshot(): MemorySnapshot {
    const snapshot = makeMemorySnapshot(this.profileId, this.listRecords());
    atomicWrite(join(this.memoryRoot, 'snapshots', `${snapshot.snapshot_id}.json`), JSON.stringify(snapshot, null, 2) + '\n');
    this.events.emit({ event: 'memory.snapshot_created', run_id: null, task_id: null, checkpoint_id: null, attributes: { count: snapshot.entries.length } });
    return snapshot;
  }
  search(query: string, request: RetrievalRequest): MemoryRecord[] {
    if (request.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Busca WARM em perfil diferente.');
    const ids = this.index.search(query).map(item => item.memory_id);
    return ids.map(id => this.get(id)).filter(record => record.status === 'active' && (!record.valid_until || record.valid_until > request.reference_time));
  }
  rebuildIndex(): number { const count = this.index.rebuild(this.listRecords().filter(r => r.status === 'active' && (!r.valid_until || r.valid_until > new Date().toISOString()))); this.events.emit({ event: 'memory.index_rebuilt', run_id: null, task_id: null, checkpoint_id: null, attributes: { index_count: count } }); return count; }
}
