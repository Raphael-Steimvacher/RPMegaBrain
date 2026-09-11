import type { CheckpointV2, MemoryRecord, MemorySnapshot } from './contracts.js';
import { hash, stableJson } from '../../infrastructure/hashing.js';

export function checkpointIntegrity(value: Omit<CheckpointV2, 'integrity_hash'> | CheckpointV2): string {
  const copy = structuredClone(value) as Partial<CheckpointV2>;
  delete copy.integrity_hash;
  return hash(stableJson(copy));
}
export function memoryContentHash(statement: string, limits: string): string {
  return hash(stableJson({ statement: statement.trim(), limits: limits.trim() }));
}
export function memorySnapshotId(records: MemoryRecord[]): string {
  const entries = records.map(record => ({ memory_id: record.memory_id, revision: record.revision, content_hash: record.content_hash, status: record.status, profile_id: record.profile_id }))
    .sort((a, b) => a.memory_id.localeCompare(b.memory_id, 'en'));
  return `memsnap_${hash(stableJson(entries)).slice(7, 31)}`;
}
export function makeMemorySnapshot(profileId: string, records: MemoryRecord[], createdAt = new Date().toISOString()): MemorySnapshot {
  const entries = records.map(record => ({ memory_id: record.memory_id, revision: record.revision, content_hash: record.content_hash, status: record.status, profile_id: record.profile_id }))
    .sort((a, b) => a.memory_id.localeCompare(b.memory_id, 'en'));
  return { snapshot_id: memorySnapshotId(records), profile_id: profileId, created_at: createdAt, entries };
}
