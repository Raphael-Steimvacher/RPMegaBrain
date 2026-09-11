import type { Mode, Stage } from '../contracts.js';

export type ProfileId = string;
export type CheckpointType = 'turn' | 'stage' | 'named' | 'pre_compact' | 'recovery' | 'final';
export type DriftLevel = 'informational' | 'review' | 'blocking' | 'security';
export type MemoryKind = 'decision' | 'correction' | 'preference' | 'convention' | 'verified_fact' | 'pattern';
export type MemoryStatus = 'active' | 'superseded' | 'expired' | 'revoked' | 'quarantined';
export type CandidateStatus = 'pending' | 'rejected' | 'deferred' | 'approved';
export type Sensitivity = 'public' | 'personal' | 'confidential';
export type Confidence = 'tentative' | 'supported' | 'confirmed';
export type ValidityType = 'static' | 'release_bound' | 'repository_bound' | 'time_bound' | 'task_bound';
export type RetrievalReasonCode = 'PROFILE_MISMATCH' | 'SOURCE_NOT_ALLOWED' | 'SENSITIVITY_BLOCKED' |
  'STATUS_INACTIVE' | 'EXPIRED' | 'CONFLICTED' | 'HASH_INVALID' | 'WORKFLOW_NOT_ALLOWED' |
  'LOW_RELEVANCE' | 'BUDGET_EXCEEDED' | 'DUPLICATE' | 'SOURCE_UNAVAILABLE' | 'PATH_BLOCKED';

export interface ContentApproval {
  kind: 'definition' | 'plan' | 'memory';
  content_hash: string;
  approved_by: 'user';
  approved_at: string;
}
export interface SourceSnapshot {
  source_id: string;
  revision: string;
  selected_hashes: string[];
  captured_at: string;
}
export interface CheckpointV2 {
  schema_version: 1;
  checkpoint_id: string;
  previous_checkpoint_id: string | null;
  type: CheckpointType;
  name: string | null;
  task_id: string;
  run_id: string;
  profile_id: ProfileId;
  mode: Mode;
  stage: Stage;
  goal: string;
  accepted_requirements: string[];
  confirmed_facts: string[];
  open_hypotheses: string[];
  approved_decisions: string[];
  plan: { status: 'pending' | 'approved'; content_ref: string | null; content_hash: string };
  approvals: ContentApproval[];
  active_files: { path: string; content_hash: string }[];
  verifications: string[];
  blockers: string[];
  next_action: string;
  context_refs: { item_id: string; revision: string; source_hash: string }[];
  memory_snapshot_id: string | null;
  source_snapshots: SourceSnapshot[];
  engine: { provider: string; thread_id: string | null; resume_optional: true };
  harness: { version: string; commit: string | null; policies_hash: string; skills_hash: string };
  created_at: string;
  integrity_hash: string;
}
export type NewCheckpoint = Omit<CheckpointV2, 'schema_version' | 'checkpoint_id' | 'previous_checkpoint_id' | 'created_at' | 'integrity_hash'> & {
  checkpoint_id?: string; previous_checkpoint_id?: string | null; created_at?: string;
};
export interface RestoreCapsule {
  schema_version: 1;
  checkpoint_id: string;
  task_id: string;
  profile_id: string;
  mode: Mode;
  stage: Stage;
  goal: string;
  accepted_requirements: string[];
  confirmed_facts: string[];
  open_hypotheses: string[];
  approved_decisions: string[];
  plan: CheckpointV2['plan'];
  active_files: CheckpointV2['active_files'];
  verifications: string[];
  blockers: string[];
  next_action: string;
  context_refs: CheckpointV2['context_refs'];
}
export interface DriftFinding { level: DriftLevel; target: string; expected: string; actual: string; }

export interface MemoryCandidate {
  schema_version: 1;
  candidate_id: string;
  profile_id: ProfileId;
  task_id: string;
  scope_id: string;
  kind: MemoryKind;
  subject: string;
  statement: string;
  limits: string;
  confidence: Confidence;
  sensitivity: Sensitivity;
  evidence_refs: string[];
  source_run_ids: string[];
  suggested_validity: { type: ValidityType; valid_until: string | null };
  duplicate_candidates: string[];
  conflict_candidates: string[];
  status: CandidateStatus;
  created_at: string;
  statement_hash: string;
  decision?: { decided_at: string; decision: 'approved' | 'edited_and_approved' | 'rejected' | 'deferred'; reason: string | null };
}
export interface MemoryRecord {
  schema_version: 1;
  memory_id: string;
  profile_id: ProfileId;
  scope_id: string;
  kind: MemoryKind;
  subject: string;
  status: MemoryStatus;
  sensitivity: Sensitivity;
  confidence: Confidence;
  created_at: string;
  verified_at: string;
  valid_until: string | null;
  validity_type: ValidityType;
  source_run_ids: string[];
  evidence_refs: string[];
  tags: string[];
  revision: number;
  previous_content_hash: string | null;
  content_hash: string;
  supersedes: string | null;
  conflicts_with: string[];
  statement: string;
  limits: string;
  last_seen_at: string;
  approval: ContentApproval;
  change_reason: string;
}
export interface MemorySnapshot { snapshot_id: string; profile_id: string; created_at: string; entries: { memory_id: string; revision: number; content_hash: string; status: MemoryStatus; profile_id: string }[]; }

export type SourceAdapter = 'filesystem-markdown' | 'git-repository' | 'runbook-directory' | 'profile-context';
export type SourceTrust = 'authoritative' | 'maintained' | 'advisory' | 'historical' | 'untrusted';
export interface FullSource {
  source_id: string;
  adapter: SourceAdapter;
  root: string;
  trust: SourceTrust;
  sensitivity: Sensitivity;
  read_only: true;
  include: string[];
  exclude: string[];
  allowed_workflows: string[];
  freshness: { strategy: 'git-commit' | 'file-hash' | 'mtime' };
  max_item_bytes: number;
}
export interface SourceRegistryDocument { schema_version: 1; profile_id: string; sources: FullSource[]; }
export interface SourceSearchResult {
  item_id: string;
  type: 'full';
  profile_id: string;
  scope_id: string;
  source_id: string;
  logical_path: string;
  line: number;
  content: string;
  source_hash: string;
  revision: string;
  sensitivity: Sensitivity;
  confidence: Confidence;
  trust: SourceTrust;
  rank_factors: string[];
}
export interface RetrievalRequest {
  schema_version: 1;
  retrieval_id: string;
  run_id: string;
  task_id: string;
  profile_id: string;
  workflow: string;
  goal: string;
  explicit_terms: string[];
  explicit_refs: string[];
  active_repository: string | null;
  active_files: string[];
  allowed_kinds: MemoryKind[];
  allowed_sources: string[];
  max_sensitivity: Sensitivity;
  reference_time: string;
  budget_tokens: number;
  max_warm: number;
  max_full: number;
  max_per_source: number;
  memory_mode: 'disabled' | 'shadow' | 'warm' | 'full';
}
export interface RetrievalItem {
  retrieval_item_id: string;
  type: 'warm' | 'full';
  item_id: string;
  revision: string;
  content: string;
  profile_id: string;
  scope_id: string;
  source_ref: string;
  source_hash: string;
  valid_until: string | null;
  sensitivity: Sensitivity;
  confidence: Confidence;
  reason_selected: string;
  rank_factors: string[];
  estimated_tokens: number;
  data_not_instructions: true;
}
export interface RetrievalRejection { item_id: string; source_id: string; reason_code: RetrievalReasonCode; }
export interface ContextBundle {
  schema_version: 1;
  retrieval_id: string;
  run_id: string;
  task_id: string;
  profile_id: string;
  memory_mode: RetrievalRequest['memory_mode'];
  memory_snapshot_id: string | null;
  source_snapshots: SourceSnapshot[];
  selected: RetrievalItem[];
  rejected: RetrievalRejection[];
  estimated_tokens: number;
  injected: boolean;
  created_at: string;
}

export interface RunManifestV2 {
  schema_version: 2;
  run_id: string;
  task_id: string;
  harness_version: string;
  harness_commit: string | null;
  telemetry_schema_version: 2;
  memory_schema_version: 1;
  checkpoint_schema_version: 1;
  retrieval_schema_version: 1;
  profile_id: string;
  mode: Mode;
  workflow: string;
  engine: {
    provider: string;
    model: string | null;
    reasoning_effort: string | null;
    codex_version: string | null;
    thread_id: string | null;
  };
  native_codex_memory: {
    use: false;
    generate: false;
    external_context_generation: false;
    policy_reason: 'megabrain_managed_memory';
  };
  configuration: { config_hash: string; policies_hash: string; skills_hash: string };
  continuity: {
    resumed: boolean;
    strategy: 'new' | 'thread' | 'checkpoint_new_thread' | 'checkpoint_only';
    checkpoint_id: string | null;
  };
  memory: { snapshot_id: string | null; selected_ids: string[] };
  sources: { registry_hash: string; snapshots: SourceSnapshot[] };
  eval_suite_version: string;
}
