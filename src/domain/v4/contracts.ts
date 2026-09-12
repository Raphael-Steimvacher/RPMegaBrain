import type { Mode } from '../contracts.js';

export type EvaluationStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'BLOCKED' | 'NOT_APPLICABLE';
export type RequirementPriority = 'mandatory' | 'desirable' | 'post_hoc';
export type ContractStatus = 'draft' | 'clarification_required' | 'frozen' | 'superseded' | 'evaluated';
export type FailureSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type DiagnosisStatus = 'hypothesis' | 'inconclusive' | 'confirmed';
export type PatternStatus = 'candidate' | 'confirmed' | 'proposal_linked' | 'monitoring' | 'resolved' | 'invalidated' | 'dismissed';
export type ProposalStatus = 'draft' | 'needs_evidence' | 'ready_for_review' | 'approved_for_candidate' | 'rejected' | 'archived' | 'superseded';

export interface TaskRequirement {
  id: string;
  priority: RequirementPriority;
  statement: string;
  source_ref: string;
  proof: { method: string; grader_id: string; expected?: string };
  dependencies: string[];
  sensitivity: 'public' | 'personal' | 'confidential';
}

export interface TaskContract {
  schema_version: 1;
  contract_id: string;
  contract_version: number;
  task_id: string;
  profile_id: string;
  mode: Mode;
  status: ContractStatus;
  goal: string;
  task_family: string;
  requirements: TaskRequirement[];
  non_goals: string[];
  expected_artifacts: string[];
  allowed_effects: string[];
  forbidden_effects: string[];
  preferred_sources: string[];
  verification_plan: string[];
  hard_gates: string[];
  rubrics: string[];
  budget: { max_tool_calls: number; max_input_tokens: number; max_output_tokens: number };
  termination: string;
  ambiguity: 'low' | 'medium' | 'high';
  origins: Record<string, string>;
  frozen_at: string | null;
  content_hash: string;
  supersedes: string | null;
}

export interface NormalizedTraceEvent {
  event_id: string;
  sequence_id: number;
  event_name: string;
  timestamp: string;
  component: string;
  status: 'success' | 'failure' | 'blocked' | 'unknown';
  reason_code: string | null;
  trace_id: string | null;
  span_id: string | null;
  input_shape: string | null;
  output_shape: string | null;
  content_hash: string | null;
  content_present: boolean;
  latency_ms: number | null;
}

export interface EvidenceBundle {
  schema_version: 1;
  bundle_id: string;
  run_id: string;
  task_id: string;
  profile_id: string;
  contract: { id: string; version: number; hash: string };
  manifest: { harness_version: string; harness_commit: string | null; config_hash: string; source_schema_version: number };
  outcome: { result_ref: string | null; artifact_refs: string[]; output_hash: string | null; output_redacted: boolean };
  verification: VerificationEvidence[];
  execution: { events: NormalizedTraceEvent[]; tool_calls: number; retries: number; duration_ms: number | null };
  context: { selected_refs: string[]; rejected_refs: string[]; used_refs: string[] };
  policy: { decisions: PolicyEvidence[]; forbidden_effects_observed: string[]; profile_matches: boolean };
  feedback: { annotation_refs: string[] };
  integrity: { status: 'complete' | 'partial' | 'blocked'; event_count_expected: number | null; event_count_observed: number; gaps: number[]; redacted_fields: number; unknown_fields: string[]; raw_trace_available: boolean };
  bundle_hash: string;
}

export interface VerificationEvidence {
  verification_id: string;
  kind: 'command' | 'test' | 'lint' | 'schema' | 'property' | 'human' | 'artifact';
  status: 'passed' | 'failed' | 'unknown';
  command_hash: string | null;
  exit_code: number | null;
  artifact_refs: string[];
  requirement_ids: string[];
  started_at: string | null;
  completed_at: string | null;
  valid_for: string[];
}

export interface PolicyEvidence { decision_id: string; decision: 'ALLOW' | 'PROMPT' | 'DENY' | 'QUARANTINE' | 'DEFER'; reason_code: string | null; hard_failure: boolean; }

export interface Finding {
  finding_id: string;
  requirement_id: string | null;
  dimension: string;
  status: EvaluationStatus;
  failure_code: string | null;
  severity: FailureSeverity;
  hard_gate: boolean;
  statement: string;
  evidence_refs: string[];
  missing_evidence: string[];
  grader_id: string;
}

export interface EvaluationResult {
  schema_version: 1;
  evaluation_id: string;
  run_id: string;
  task_id: string;
  profile_id: string;
  contract_ref: { id: string; version: number };
  evidence_bundle_ref: { id: string; hash: string };
  status: EvaluationStatus;
  hard_gates: { passed: number; failed: number; blocked: number };
  requirements: { mandatory: { passed: number; failed: number; inconclusive: number }; desirable: { passed: number; failed: number; inconclusive: number } };
  findings: Finding[];
  soft_scores: Record<string, number>;
  grader_runs: string[];
  model_grader: { enabled: false; reason: string };
  created_at: string;
  result_hash: string;
}

export interface DiagnosisHypothesis {
  hypothesis_id: string;
  statement: string;
  target_component: string;
  mechanism: string;
  evidence_for: string[];
  evidence_against: string[];
  expected_counterfactual: string;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  status: 'hypothesis' | 'unknown';
}

export interface Diagnosis {
  schema_version: 1;
  diagnosis_id: string;
  evaluation_id: string;
  finding_ids: string[];
  status: DiagnosisStatus;
  failure_code: string;
  symptom: string;
  localization: { first_observed_divergence: string | null; component: string | null };
  hypotheses: DiagnosisHypothesis[];
  alternatives: string[];
  missing_evidence: string[];
  next_observation: string;
  fingerprint: string;
  created_at: string;
}

export interface Pattern {
  schema_version: 1;
  pattern_id: string;
  status: PatternStatus;
  profile_scope: string[];
  failure_code: string;
  component: string;
  stage: string;
  task_family: string;
  independent_case_count: number;
  case_refs: string[];
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  first_seen: string;
  last_seen: string;
  fingerprint: string;
  urgent: boolean;
  proposal_ref: string | null;
}

export interface ImprovementProposal {
  schema_version: 1;
  proposal_id: string;
  status: ProposalStatus;
  profile_scope: string[];
  source: { pattern_id: string | null; diagnosis_ids: string[] };
  target: { type: string; component_id: string };
  problem: { statement: string; failure_code: string; observed_impact: string };
  change: { intended_behavior: string; non_goals: string[] };
  evidence: { supporting: string[]; refuting: string[] };
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  affected_versions: string[];
  regression_plan: { cases: string[]; hard_gates: string[] };
  risk: { security: string; privacy: string; memory: string };
  rollback: { strategy: string };
  human_decision: string | null;
  created_at: string;
}

export interface HumanAnnotation {
  schema_version: 1;
  annotation_id: string;
  annotator_role: string;
  profile_id: string;
  target_type: string;
  target_id: string;
  label: string;
  critique: string;
  corrected_value: string | null;
  evidence_refs: string[];
  created_at: string;
  supersedes: string | null;
  sensitivity: 'public' | 'personal' | 'confidential';
  regression_consent: boolean;
}

export interface EvidenceInput {
  run_id: string;
  task_id: string;
  profile_id: string;
  harness_version?: string;
  harness_commit?: string | null;
  config_hash?: string;
  result_ref?: string | null;
  output?: string | null;
  artifact_refs?: string[];
  events?: Array<Record<string, unknown>>;
  verification?: Array<Partial<VerificationEvidence> & { verification_id: string; kind: VerificationEvidence['kind']; status: VerificationEvidence['status'] }>;
  context?: Partial<EvidenceBundle['context']>;
  policy?: Partial<EvidenceBundle['policy']>;
  event_count_expected?: number | null;
  raw_trace_available?: boolean;
}
