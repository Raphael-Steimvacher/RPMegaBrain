import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, withDirectoryLock } from '../v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../v2/paths.js';
import { redact } from '../privacy.js';

export interface IntegrationEvent {
  schema_version: 3;
  event: string;
  created_at: string;
  run_id: string | null;
  task_id: string | null;
  profile_id: string;
  connector_id: string | null;
  attributes: Record<string, string | number | boolean | null>;
}
const allowed = new Set([
  'provider', 'capability', 'decision', 'reason_code', 'receipt_id', 'external_ref_id',
  'object_id_hash', 'catalog_hash', 'input_bytes', 'output_bytes', 'pages', 'count',
  'latency_ms', 'retry_count', 'status', 'effect_class', 'truncated', 'redacted',
  'connector_snapshot_id', 'payload_hash', 'integration_mode',
]);
function attributes(input: Record<string, unknown>): IntegrationEvent['attributes'] {
  const result: IntegrationEvent['attributes'] = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (typeof value === 'string') result[key] = redact(value).slice(0, 300);
    else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'boolean' || value === null) result[key] = value;
  }
  return result;
}
export class IntegrationEventLog {
  private readonly path: string;
  private readonly lockPath: string;
  constructor(stateRoot: string, readonly profileId: string) {
    assertIdentifier(profileId, 'profile_id');
    const directory = join(stateRoot, 'profiles', profileId, 'integrations', 'events');
    ensurePrivateDirectory(directory); ensurePrivateDirectory(join(stateRoot, 'locks'));
    this.path = join(directory, 'events-v3.jsonl'); this.lockPath = join(stateRoot, 'locks', `integration-events-${profileId}`);
  }
  emit(event: Omit<IntegrationEvent, 'schema_version' | 'created_at' | 'profile_id' | 'attributes'> & { attributes?: Record<string, unknown> }): IntegrationEvent {
    const value: IntegrationEvent = { schema_version: 3, created_at: new Date().toISOString(), profile_id: this.profileId,
      event: event.event, run_id: event.run_id, task_id: event.task_id, connector_id: event.connector_id, attributes: attributes(event.attributes ?? {}) };
    withDirectoryLock(this.lockPath, () => atomicWrite(this.path, (existsSync(this.path) ? readFileSync(this.path, 'utf8') : '') + JSON.stringify(value) + '\n'));
    return value;
  }
  read(): IntegrationEvent[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as IntegrationEvent);
  }
}
