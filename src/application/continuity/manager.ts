import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { CheckpointV2, DriftFinding, NewCheckpoint, RestoreCapsule } from '../../domain/v2/contracts.js';
import type { ContinuityResult, ThreadPort } from '../../domain/v2/continuity.js';
import type { CheckpointStorePort } from '../../domain/v2/checkpoint-store.js';
import { hash } from '../../infrastructure/hashing.js';
import { DomainError } from '../../domain/policy.js';
import { EventLogV2 } from '../../infrastructure/v2/events.js';

export class UnavailableThreadPort implements ThreadPort {
  async resume(): Promise<never> { throw new DomainError('THREAD_UNAVAILABLE', 'Nenhum adapter de thread foi configurado.'); }
  async start(): Promise<{ thread_id: null }> { return { thread_id: null }; }
}
export interface ResumeOptions {
  checkpoint_id?: string;
  new_thread?: boolean;
  accept_drift?: boolean;
  workspace_root?: string;
  policies_hash?: string;
  skills_hash?: string;
  memory_snapshot_id?: string | null;
  persist_recovery?: boolean;
}
export function buildRestoreCapsule(checkpoint: CheckpointV2): RestoreCapsule {
  return {
    schema_version: 1, checkpoint_id: checkpoint.checkpoint_id, task_id: checkpoint.task_id, profile_id: checkpoint.profile_id,
    mode: checkpoint.mode, stage: checkpoint.stage, goal: checkpoint.goal,
    accepted_requirements: checkpoint.accepted_requirements, confirmed_facts: checkpoint.confirmed_facts,
    open_hypotheses: checkpoint.open_hypotheses, approved_decisions: checkpoint.approved_decisions,
    plan: checkpoint.plan, active_files: checkpoint.active_files, verifications: checkpoint.verifications,
    blockers: checkpoint.blockers, next_action: checkpoint.next_action, context_refs: checkpoint.context_refs,
    ...(checkpoint.external_refs ? { external_refs: checkpoint.external_refs } : {}),
    ...(checkpoint.connector_snapshot_id !== undefined ? { connector_snapshot_id: checkpoint.connector_snapshot_id } : {}),
    ...(checkpoint.consent_receipt_ids ? { consent_receipt_ids: checkpoint.consent_receipt_ids } : {}),
    ...(checkpoint.source_freshness ? { source_freshness: checkpoint.source_freshness } : {}),
    ...(checkpoint.unresolved_auth ? { unresolved_auth: checkpoint.unresolved_auth } : {}),
    ...(checkpoint.cross_connector_routes ? { cross_connector_routes: checkpoint.cross_connector_routes } : {}),
  };
}
export function detectDrift(checkpoint: CheckpointV2, options: ResumeOptions): DriftFinding[] {
  const result: DriftFinding[] = [];
  if (options.policies_hash && checkpoint.harness.policies_hash !== options.policies_hash) {
    result.push({ level: 'security', target: 'policies', expected: checkpoint.harness.policies_hash, actual: options.policies_hash });
  }
  if (options.skills_hash && checkpoint.harness.skills_hash !== options.skills_hash) {
    result.push({ level: 'review', target: 'skills', expected: checkpoint.harness.skills_hash, actual: options.skills_hash });
  }
  if (options.memory_snapshot_id !== undefined && checkpoint.memory_snapshot_id !== options.memory_snapshot_id) {
    result.push({ level: 'review', target: 'memory_snapshot', expected: checkpoint.memory_snapshot_id ?? 'none', actual: options.memory_snapshot_id ?? 'none' });
  }
  if (options.workspace_root) {
    const root = resolve(options.workspace_root);
    for (const file of checkpoint.active_files) {
      const path = isAbsolute(file.path) ? resolve(file.path) : resolve(root, file.path);
      if (!existsSync(path)) result.push({ level: 'blocking', target: file.path, expected: file.content_hash, actual: 'missing' });
      else {
        const actual = hash(readFileSync(path));
        if (actual !== file.content_hash) result.push({ level: checkpoint.plan.status === 'approved' ? 'blocking' : 'review', target: file.path, expected: file.content_hash, actual });
      }
    }
  }
  return result;
}
export class ContinuityManager {
  constructor(private readonly store: CheckpointStorePort, private readonly events: EventLogV2, private readonly threads: ThreadPort = new UnavailableThreadPort()) {}
  async resume(taskId: string, options: ResumeOptions = {}): Promise<ContinuityResult> {
    const checkpoint = options.checkpoint_id ? this.store.load(taskId, options.checkpoint_id) : this.store.loadCurrent(taskId, true);
    if (checkpoint.plan.status === 'approved' && !checkpoint.approvals.some(a => a.kind === 'plan' && a.content_hash === checkpoint.plan.content_hash && a.approved_by === 'user')) {
      throw new DomainError('APPROVAL_INVALID', 'A aprovação do plano não corresponde ao checkpoint.');
    }
    const drift = detectDrift(checkpoint, options);
    for (const finding of drift) this.events.emit({ event: 'checkpoint.drift_detected', run_id: checkpoint.run_id, task_id: checkpoint.task_id, checkpoint_id: checkpoint.checkpoint_id, attributes: { drift_level: finding.level } });
    if (drift.some(d => d.level === 'security')) throw new DomainError('SECURITY_DRIFT', 'Policy incompatível; retomada recusada.');
    if (drift.some(d => d.level === 'blocking')) throw new DomainError('BLOCKING_DRIFT', 'Drift invalida o plano ou arquivos ativos.');
    const confirmationRequired = drift.some(d => d.level === 'review') && !options.accept_drift;
    if (confirmationRequired) {
      this.events.emit({ event: 'continuity.user_confirmation_required', run_id: checkpoint.run_id, task_id: taskId, checkpoint_id: checkpoint.checkpoint_id, attributes: { drift_level: 'review' } });
    }
    const capsule = buildRestoreCapsule(checkpoint);
    this.events.emit({ event: 'continuity.restore_capsule_built', run_id: checkpoint.run_id, task_id: taskId, checkpoint_id: checkpoint.checkpoint_id });
    if (confirmationRequired) return { checkpoint, capsule, strategy: 'checkpoint_only', thread_id: checkpoint.engine.thread_id, drift, confirmation_required: true };
    let strategy: ContinuityResult['strategy'] = 'checkpoint_only';
    let threadId = checkpoint.engine.thread_id;
    if (!options.new_thread && threadId) {
      try {
        const resumed = await this.threads.resume(threadId, capsule); threadId = resumed.thread_id; strategy = 'thread';
        this.events.emit({ event: 'continuity.thread_resumed', run_id: checkpoint.run_id, task_id: taskId, checkpoint_id: checkpoint.checkpoint_id, attributes: { strategy } });
      } catch (error) {
        this.events.emit({ event: 'continuity.thread_resume_failed', run_id: checkpoint.run_id, task_id: taskId, checkpoint_id: checkpoint.checkpoint_id,
          attributes: { reason_code: error instanceof DomainError ? error.code : 'THREAD_ERROR' } });
        const started = await this.threads.start(capsule); threadId = started.thread_id; strategy = started.thread_id ? 'checkpoint_new_thread' : 'checkpoint_only';
      }
    } else {
      const started = await this.threads.start(capsule); threadId = started.thread_id; strategy = started.thread_id ? 'checkpoint_new_thread' : 'checkpoint_only';
    }
    this.events.emit({ event: 'continuity.recovered_from_checkpoint', run_id: checkpoint.run_id, task_id: taskId, checkpoint_id: checkpoint.checkpoint_id, attributes: { strategy } });
    if (options.persist_recovery !== false) {
      const { schema_version: _schema, integrity_hash: _integrity, checkpoint_id: _checkpoint, created_at: _created, previous_checkpoint_id: _previous, ...rest } = structuredClone(checkpoint);
      void _schema; void _integrity; void _checkpoint; void _created; void _previous;
      const next: NewCheckpoint = { ...rest, previous_checkpoint_id: checkpoint.checkpoint_id,
        type: 'recovery', name: null, engine: { ...checkpoint.engine, thread_id: threadId } };
      const recovery = this.store.create(next);
      return { checkpoint: recovery, capsule: buildRestoreCapsule(recovery), strategy, thread_id: threadId, drift, confirmation_required: false };
    }
    return { checkpoint, capsule, strategy, thread_id: threadId, drift, confirmation_required: false };
  }
}
