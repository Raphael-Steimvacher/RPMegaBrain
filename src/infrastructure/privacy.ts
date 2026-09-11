// Defense in depth. This is deliberately not advertised as a universal DLP filter.
export const redactionPolicy = 'metadata-only-v1; drop-unlisted-attributes; redact-known-credentials-and-email';
export function redact(text: string): string {
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,})\b/g, '[REDACTED_TOKEN]')
    .replace(/\bBearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b([\w.-]*(?:api[_-]?key|secret|token|password)[\w.-]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');
}
const attributeAllowlist = new Set(['profile_id', 'mode', 'simulated', 'from_state', 'to_state', 'artifact_hash', 'artifact', 'reason_code', 'thread_id', 'verdict', 'hard_failure_count', 'weighted_score', 'check_count', 'engine', 'config_hash']);
export function safeAttributes(input: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!attributeAllowlist.has(key)) continue;
    if (typeof value === 'string') result[key] = redact(value).slice(0, 300);
    else if (typeof value === 'boolean' || value === null || (typeof value === 'number' && Number.isFinite(value))) result[key] = value;
  }
  return result;
}
