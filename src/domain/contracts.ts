export type Mode = 'teach' | 'implement';
export type State = 'created' | 'defined' | 'investigating' | 'plan_ready' |
  'awaiting_user_code' | 'implementing' | 'reviewing' | 'verified' | 'needs_changes' | 'evaluated';
export type Stage = 'definition' | 'investigation' | 'planning' | 'implementation' | 'review' | 'verification' | 'evaluation';
export type Verdict = 'accepted' | 'accepted_with_corrections' | 'rejected' | 'blocked';
export interface TaskInput {
  schema_version: 1;
  task_id: string;
  title: string;
  description: string;
  synthetic: true;
  acceptance_criteria: string[];
}
export interface Approval {
  status: 'pending' | 'approved';
  artifact_hash: string;
  approved_by?: 'user';
  approved_at?: string;
}
export interface TaskState {
  schema_version: 1;
  task_id: string;
  active_run_id: string;
  state: State;
  definition: Approval;
  plan: Approval;
  next_action: string;
}
export interface Profile {
  schema_version: 1;
  id: string;
  label: string;
  classification: 'synthetic' | 'personal' | 'work';
  defaults: { mode: 'teach'; workflow: 'wac'; network: 'denied' };
  source_allowlist: string[];
  skill_allowlist: string[];
  telemetry: { capture_prompt_content: false; capture_tool_content: false; raw_retention_days: number };
}
export interface Manifest {
  schema_version: 1;
  telemetry_schema_version: 1;
  run_id: string;
  task_id: string;
  run_revision: number;
  started_at: string;
  harness: { version: string; commit: string | null; config_hash: string };
  engine: { provider: 'local'; adapter: 'mock'; sdk_version: null; model: 'synthetic'; reasoning_effort: null; thread_id: string | null };
  execution: { profile: 'synthetic'; workflow: 'wac'; stage: Stage; mode: Mode; sandbox: 'not-applicable'; simulated: true };
  components: { policies: { id: string; hash: string }[]; skills: { id: string; hash: string }[] };
  sources: { id: string; revision: string; catalog_hash: string }[];
  privacy: { prompt_content_recorded: false; tool_content_recorded: false; redaction_policy_hash: string };
}
export const eventNames = [
  'run.started', 'profile.selected', 'policy.composed', 'workflow.selected', 'task.state_changed',
  'skill.selected', 'context.lookup_started', 'context.item_selected', 'context.item_rejected',
  'context.bundle_built', 'engine.thread_started', 'engine.thread_resumed', 'engine.completed',
  'engine.failed', 'engine.cancelled', 'tool.started', 'tool.completed', 'tool.failed',
  'policy.blocked', 'mode.changed', 'approval.recorded', 'verification.completed',
  'evaluation.recorded', 'feedback.proposed', 'feedback.rejected', 'run.completed', 'run.failed',
] as const;
export type EventName = typeof eventNames[number];
export interface TraceEvent {
  schema_version: 1;
  timestamp: string;
  sequence: number;
  run_id: string;
  task_id: string;
  producer: string;
  event_name: EventName;
  phase: Stage;
  outcome: 'success' | 'blocked' | 'failure';
  duration_ms: number;
  attributes: Record<string, string | number | boolean | null>;
}
export const scoreKeys = ['technical_correctness', 'requirement_coverage', 'actionability', 'teaching_clarity', 'efficiency'] as const;
export const hardFailures = ['policy_violation', 'profile_mixing', 'secret_leak', 'unexecuted_test_claim', 'invented_reference', 'out_of_scope_change'] as const;
export interface Evaluation {
  schema_version: 1;
  run_id: string;
  verdict: Verdict;
  hard_failures: (typeof hardFailures[number])[];
  scores: Record<typeof scoreKeys[number], number>;
  corrections: { category: string; note: string }[];
  user_notes: string;
}
export interface Checkpoint {
  schema_version: 1;
  storage_revision: number;
  manifest: Manifest;
  task: TaskInput;
  profile: Profile;
  state: TaskState;
  artifacts: { definition: string; plan: string; result: string };
  events: TraceEvent[];
  evaluation: Evaluation | null;
}
