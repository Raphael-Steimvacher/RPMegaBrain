import type { CheckpointV2, NewCheckpoint } from './contracts.js';
export interface CheckpointVerification { valid: boolean; checkpoint_id: string; errors: string[]; }
export interface CheckpointStorePort {
  create(input: NewCheckpoint): CheckpointV2;
  loadCurrent(taskId: string, allowFallback?: boolean): CheckpointV2;
  load(taskId: string, checkpointId: string): CheckpointV2;
  list(taskId: string): CheckpointV2[];
  inspect(checkpointId: string): CheckpointV2;
  verify(checkpointId: string): CheckpointVerification;
}
