export const codexHookEvents = ['SessionStart', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop', 'Interrupt', 'SessionEnd'] as const;
export type CodexHookEvent = typeof codexHookEvents[number];
export interface CodexHookTelemetryV1 {
  schema_version: 1;
  event_id: string;
  sequence_id: number;
  observed_at: string;
  repository_id: string;
  profile_id: string;
  session_ref: string;
  turn_ref: string | null;
  tool_call_ref: string | null;
  hook_event: CodexHookEvent;
  tool_name: string | null;
  permission_mode: string | null;
  model: string | null;
  session_source: 'startup' | 'resume' | 'clear' | 'compact' | null;
  status: 'success' | 'failure' | 'blocked' | 'unknown';
  reason_code: string | null;
}
export interface HookRegistrationV1 { schema_version: 1; repository_id: string; profile_id: string; config_hash: string; installed_at: string; }
export interface HookSealV1 { schema_version: 1; session_ref: string; event_count: number; journal_hash: string; sealed_at: string; }
