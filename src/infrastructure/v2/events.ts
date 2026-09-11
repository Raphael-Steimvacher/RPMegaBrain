import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, withDirectoryLock } from './atomic.js';
import { ensurePrivateDirectory, assertIdentifier } from './paths.js';
import { redact } from '../privacy.js';

export interface DomainEventV2 {
  schema_version: 2;
  event: string;
  created_at: string;
  run_id: string | null;
  task_id: string | null;
  checkpoint_id: string | null;
  profile_id: string;
  attributes: Record<string, string | number | boolean | null>;
}
const allowed = new Set(['strategy','reason_code','checkpoint_type','drift_level','memory_id','memory_revision','candidate_id','source_id','retrieval_id','rank_position','budget_tokens_estimated','status','revision','count','mode','workflow','fallback_checkpoint_id','current_checkpoint_id','injected','index_count','decision','purged_candidates','search_backend']);
export function safeEventAttributes(input: Record<string, unknown>): DomainEventV2['attributes'] {
  const result: DomainEventV2['attributes'] = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (typeof value === 'string') result[key] = redact(value).slice(0, 300);
    else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'boolean' || value === null) result[key] = value;
  }
  return result;
}
export class EventLogV2 {
  private readonly path: string;
  private readonly lockPath: string;
  constructor(stateRoot: string, readonly profileId: string) {
    assertIdentifier(profileId, 'profile_id');
    const directory = join(stateRoot, 'profiles', profileId, 'events');
    ensurePrivateDirectory(directory);
    ensurePrivateDirectory(join(stateRoot, 'locks'));
    this.path = join(directory, 'events.jsonl');
    this.lockPath = join(stateRoot, 'locks', `events-${profileId}`);
  }
  emit(event: Omit<DomainEventV2, 'schema_version' | 'created_at' | 'profile_id' | 'attributes'> & { attributes?: Record<string, unknown> }): DomainEventV2 {
    const value: DomainEventV2 = { schema_version: 2, created_at: new Date().toISOString(), profile_id: this.profileId,
      event: event.event, run_id: event.run_id, task_id: event.task_id, checkpoint_id: event.checkpoint_id,
      attributes: safeEventAttributes(event.attributes ?? {}) };
    withDirectoryLock(this.lockPath, () => {
      const current = existsSync(this.path) ? readFileSync(this.path, 'utf8') : '';
      atomicWrite(this.path, current + JSON.stringify(value) + '\n');
    });
    return value;
  }
  read(): DomainEventV2[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as DomainEventV2);
  }
}
