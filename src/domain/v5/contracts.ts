export type CandidateMode = 'disabled' | 'dry-run' | 'shadow' | 'supervised';
export type CandidateStatus = 'BLOCKED' | 'REQUESTED' | 'PLANNED' | 'AUTHORIZED' | 'WORKSPACE_READY' | 'BUILDING' | 'FROZEN' | 'EVALUATING' | 'REVIEWED' | 'AWAITING_DECISION' | 'PASSED' | 'FAILED' | 'INCONCLUSIVE' | 'CHANGES_REQUESTED' | 'ACCEPTED_FOR_MANUAL_INTEGRATION' | 'REJECTED' | 'DEFERRED' | 'ARCHIVED';

export interface CandidateManifest {
  schema_version: 5;
  candidate_id: string;
  proposal: { id: string; version: number; status: string; target_component: string };
  profile_id: string;
  mode: CandidateMode;
  status: CandidateStatus;
  revision: number;
  repository: { path: string; identity: string; base_ref: string; base_sha: string; main_dirty: boolean; dirty_paths_count: number };
  allowed_paths: string[];
  diff_budget: { files: number; added_lines: number; deleted_lines: number };
  branch: string | null;
  baseline_path: string | null;
  candidate_path: string | null;
  authorization_hash: string | null;
  environment_hash: string | null;
  snapshot: { commit_sha: string; tree_sha: string; change_set_hash: string } | null;
  comparison_hash: string | null;
  review_hash: string | null;
  report_hash: string | null;
  main_fingerprint_before: string;
  main_fingerprint_after: string | null;
  created_at: string;
}

export interface CandidateRequest {
  schema_version: 1;
  candidate_id: string;
  proposal: { id: string; version: number; decision: 'ApprovedForCandidate' };
  profile_id: string;
  repository: { path: string; identity: string; requested_base: string; resolved_base_sha: string };
  requested_target: { component: string; paths: string[] };
  mode: CandidateMode;
  requested_by: string;
  created_at: string;
  idempotency_key: string;
  payload_hash: string;
}

export interface CandidateAuthorization {
  schema_version: 1;
  authorization_id: string;
  candidate_id: string;
  proposal_ref: { id: string; version: number };
  profile_id: string;
  repository_identity: string;
  base_sha: string;
  revision: number;
  allowed_paths: string[];
  allowed_operations: string[];
  forbidden_operations: string[];
  diff_budget: { files: number; added_lines: number; deleted_lines: number };
  authorized_by: 'user';
  authorized_at: string;
  expires_at: string;
  scope_hash: string | null;
  payload_hash: string;
}

export interface WorkspaceLease {
  schema_version: 1;
  lease_id: string;
  candidate_id: string;
  owner_run_id: string;
  repository_identity: string;
  base_sha: string;
  baseline_path: string;
  candidate_path: string;
  locked: true;
  issued_at: string;
  heartbeat_at: string;
  expires_at: string;
}

export interface EnvironmentManifest {
  schema_version: 1;
  candidate_id: string;
  base_sha: string;
  platform: { os: string; arch: string; node: string; npm: string };
  lockfiles: Record<string, string>;
  network: 'denied';
  setup: { source: 'base_commit'; script_hash: string };
  environment_names: string[];
  isolation: { separate_tmp: boolean; separate_cache: boolean };
  preflight: 'passed' | 'blocked';
  payload_hash: string;
}

export interface ChangePlan {
  schema_version: 1;
  candidate_id: string;
  revision: number;
  hypothesis: string;
  target_component: string;
  base_sha: string;
  allowed_paths: string[];
  steps: string[];
  non_goals: string[];
  diff_budget: { files: number; added_lines: number; deleted_lines: number };
  verification_commands: string[];
  frozen_at: string | null;
  plan_hash: string;
}

export interface ScopeReport {
  schema_version: 1;
  candidate_id: string;
  revision: number;
  files: string[];
  out_of_scope: string[];
  added_lines: number;
  deleted_lines: number;
  symlinks: string[];
  binaries: string[];
  sensitive_paths: string[];
  passed: boolean;
  reason: string | null;
  diff_hash: string;
}

export interface CandidateSnapshot {
  schema_version: 1;
  candidate_id: string;
  revision: number;
  branch: string;
  base_sha: string;
  commit_sha: string;
  tree_sha: string;
  parent_sha: string;
  change_set_hash: string;
  environment_hash: string;
  frozen_at: string;
}

export interface RegressionComparison {
  schema_version: 1;
  candidate_id: string;
  revision: number;
  snapshot_commit: string;
  baseline_sha: string;
  environment_hash: string;
  causal_case: { baseline: 'passed' | 'failed' | 'blocked'; candidate: 'passed' | 'failed' | 'blocked'; classification: 'Improved' | 'Equivalent' | 'Regressed' | 'Inconclusive' };
  hard_gates: { main_unchanged: boolean; scope_passed: boolean; policy_violations: number; profile_leaks: number; false_successes: number };
  metrics: { baseline_exit: number | null; candidate_exit: number | null; baseline_duration_ms: number; candidate_duration_ms: number };
  overall: 'EligibleForReview' | 'BlockedByHardRegression' | 'NeedsMoreEvidence' | 'InvalidExperiment' | 'BlockedByEnvironment';
  comparison_hash: string;
}

export interface CodeReviewReport {
  schema_version: 1;
  candidate_id: string;
  revision: number;
  snapshot_commit: string;
  mode: 'read_only';
  changed_paths: string[];
  findings: Array<{ id: string; severity: 'P0' | 'P1' | 'P2' | 'P3'; path: string | null; summary: string }>;
  recommendation: 'human_decision_required' | 'blocked';
  review_hash: string;
}

export interface ImpactReport {
  schema_version: 1;
  candidate_id: string;
  revision: number;
  proposal_ref: string;
  base_sha: string;
  snapshot_commit: string;
  change_set_hash: string;
  comparison_hash: string;
  review_hash: string;
  hard_gates_passed: boolean;
  recommendation: 'RecommendAcceptForManualIntegration' | 'RecommendRequestChanges' | 'RecommendReject' | 'RecommendDefer' | 'InsufficientEvidence';
  changed_paths: string[];
  limitations: string[];
  report_hash: string;
}

export interface CandidateDecision {
  schema_version: 1;
  decision_id: string;
  candidate_id: string;
  revision: number;
  snapshot_commit: string;
  report_hash: string;
  decision: 'AcceptedForManualIntegration' | 'ChangesRequested' | 'Rejected' | 'Deferred' | 'NeedsEvidence';
  decided_by: 'user';
  reason: string;
  conditions: string[];
  decided_at: string;
  payload_hash: string;
}

export interface CleanupReceipt {
  schema_version: 1;
  cleanup_id: string;
  candidate_id: string;
  archive_hash: string;
  removed_worktrees: string[];
  branch_deleted: false;
  forced: false;
  confirmed_by: 'user';
  completed_at: string;
  payload_hash: string;
}
