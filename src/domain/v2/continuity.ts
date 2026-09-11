import type { CheckpointV2, DriftFinding, RestoreCapsule } from './contracts.js';
export interface ThreadPort {
  resume(threadId: string, capsule: RestoreCapsule): Promise<{ thread_id: string }>;
  start(capsule: RestoreCapsule): Promise<{ thread_id: string | null }>;
}
export interface ContinuityResult {
  checkpoint: CheckpointV2;
  capsule: RestoreCapsule;
  strategy: 'thread' | 'checkpoint_new_thread' | 'checkpoint_only';
  thread_id: string | null;
  drift: DriftFinding[];
  confirmation_required: boolean;
}
