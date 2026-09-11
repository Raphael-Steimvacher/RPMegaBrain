import type { MemoryCandidate, MemoryRecord, MemorySnapshot, RetrievalRequest } from './contracts.js';
export interface CandidateInput extends Omit<MemoryCandidate, 'schema_version' | 'candidate_id' | 'status' | 'created_at' | 'statement_hash' | 'duplicate_candidates' | 'conflict_candidates' | 'decision'> {
  candidate_id?: string;
}
export interface ReviewDecision { decision: 'approve' | 'edit_and_approve' | 'reject' | 'defer'; expected_hash: string; edited_statement?: string; edited_limits?: string; tags?: string[]; reason?: string; }
export interface ReviewResult { candidate: MemoryCandidate; record: MemoryRecord | null; duplicate_of: string | null; conflict_ids: string[]; }
export interface ForgetResult { memory_id: string; profile_id: string; deleted_at: string; reason: string; purged_candidates: number; }
export interface WarmMemoryStorePort {
  propose(input: CandidateInput): MemoryCandidate;
  listCandidates(): MemoryCandidate[];
  review(candidateId: string, decision: ReviewDecision): ReviewResult;
  get(memoryId: string): MemoryRecord;
  history(memoryId: string): MemoryRecord[];
  listRecords(): MemoryRecord[];
  revoke(memoryId: string, expectedHash: string, reason: string): MemoryRecord;
  forget(memoryId: string, expectedHash: string, reason: string): ForgetResult;
  expire(referenceTime?: string): MemoryRecord[];
  snapshot(): MemorySnapshot;
  search(query: string, request: RetrievalRequest): MemoryRecord[];
  rebuildIndex(): number;
}
