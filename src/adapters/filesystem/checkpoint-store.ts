import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CheckpointStorePort, CheckpointVerification } from '../../domain/v2/checkpoint-store.js';
import type { CheckpointV2, NewCheckpoint } from '../../domain/v2/contracts.js';
import { checkpointIntegrity } from '../../domain/v2/integrity.js';
import { DomainError } from '../../domain/policy.js';
import { RunStore } from '../../infrastructure/run-store.js';
import { validateV2 } from '../../infrastructure/v2/validation.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../infrastructure/v2/paths.js';
import { atomicWrite, withDirectoryLock } from '../../infrastructure/v2/atomic.js';
import { detectedSecretCodes } from '../../infrastructure/v2/secrets.js';
import { EventLogV2 } from '../../infrastructure/v2/events.js';

export class FilesystemCheckpointStore implements CheckpointStorePort {
  readonly stateRoot: string;
  readonly events: EventLogV2;
  constructor(stateRoot: string | undefined, readonly profileId: string) {
    assertIdentifier(profileId, 'profile_id');
    this.stateRoot = new RunStore(stateRoot).root;
    this.events = new EventLogV2(this.stateRoot, profileId);
  }
  private taskRoot(taskId: string): string {
    assertIdentifier(taskId, 'task_id');
    return join(this.stateRoot, 'profiles', this.profileId, 'tasks', taskId);
  }
  private checkpointPath(taskId: string, checkpointId: string): string {
    assertIdentifier(checkpointId, 'checkpoint_id');
    if (!checkpointId.startsWith('chk_')) throw new DomainError('INVALID_CHECKPOINT_ID', 'Checkpoint ID inválido.');
    return join(this.taskRoot(taskId), 'checkpoints', `${checkpointId}.json`);
  }
  create(input: NewCheckpoint): CheckpointV2 {
    if (input.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Checkpoint pertence a outro perfil.');
    const secretCodes = detectedSecretCodes(JSON.stringify(input));
    if (secretCodes.length) {
      this.events.emit({ event: 'secret.detected', run_id: input.run_id, task_id: input.task_id, checkpoint_id: null, attributes: { reason_code: secretCodes[0] } });
      throw new DomainError('SECRET_DETECTED', 'Conteúdo sensível bloqueou a persistência do checkpoint.');
    }
    const taskRoot = this.taskRoot(input.task_id);
    ensurePrivateDirectory(join(taskRoot, 'checkpoints'));
    ensurePrivateDirectory(join(this.stateRoot, 'locks'));
    return withDirectoryLock(join(this.stateRoot, 'locks', `checkpoint-${this.profileId}-${input.task_id}`), () => {
      const current = this.readCurrentId(input.task_id);
      if (input.previous_checkpoint_id !== undefined && input.previous_checkpoint_id !== current) throw new DomainError('STALE_CHECKPOINT', 'O checkpoint anterior mudou; recarregue a tarefa.');
      const checkpointId = input.checkpoint_id ?? `chk_${randomUUID()}`;
      if (!/^chk_[A-Za-z0-9-]+$/.test(checkpointId)) throw new DomainError('INVALID_CHECKPOINT_ID', 'Checkpoint ID inválido.');
      if (input.type === 'named' && !input.name) throw new DomainError('CHECKPOINT_NAME_REQUIRED', 'Checkpoint nomeado exige name.');
      if (input.plan.status === 'approved' && !input.approvals.some(a => a.kind === 'plan' && a.content_hash === input.plan.content_hash && a.approved_by === 'user')) {
        throw new DomainError('APPROVAL_REQUIRED', 'Plano aprovado exige aprovação humana vinculada ao hash atual.');
      }
      if (input.mode === 'implement' && input.plan.status !== 'approved') throw new DomainError('APPROVAL_REQUIRED', 'Modo implement exige plano aprovado.');
      const base = { ...structuredClone(input), schema_version: 1 as const, checkpoint_id: checkpointId,
        previous_checkpoint_id: current, created_at: input.created_at ?? new Date().toISOString() };
      const checkpoint = { ...base, integrity_hash: checkpointIntegrity(base as Omit<CheckpointV2, 'integrity_hash'>) } as CheckpointV2;
      validateV2<CheckpointV2>('checkpoint', checkpoint);
      const path = this.checkpointPath(input.task_id, checkpointId);
      if (existsSync(path)) throw new DomainError('CHECKPOINT_EXISTS', 'Checkpoint já existe.');
      writeFileSync(path, JSON.stringify(checkpoint, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      const reread = this.parseAndVerify(path);
      atomicWrite(join(taskRoot, 'current'), `${reread.checkpoint_id}\n`);
      this.events.emit({ event: 'checkpoint.created', run_id: checkpoint.run_id, task_id: checkpoint.task_id, checkpoint_id: checkpoint.checkpoint_id,
        attributes: { checkpoint_type: checkpoint.type, current_checkpoint_id: checkpoint.checkpoint_id } });
      return reread;
    });
  }
  private readCurrentId(taskId: string): string | null {
    const path = join(this.taskRoot(taskId), 'current');
    if (!existsSync(path)) return null;
    const value = readFileSync(path, 'utf8').trim();
    if (!/^chk_[A-Za-z0-9-]+$/.test(value)) throw new DomainError('CORRUPT_CURRENT_POINTER', 'Ponteiro current inválido.');
    return value;
  }
  private parseAndVerify(path: string): CheckpointV2 {
    let value: CheckpointV2;
    try { value = JSON.parse(readFileSync(path, 'utf8')) as CheckpointV2; }
    catch { throw new DomainError('CORRUPT_CHECKPOINT', 'Checkpoint não contém JSON legível.'); }
    validateV2<CheckpointV2>('checkpoint', value);
    if (checkpointIntegrity(value) !== value.integrity_hash) throw new DomainError('CORRUPT_CHECKPOINT', 'Hash de integridade do checkpoint não confere.');
    if (value.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Checkpoint pertence a outro perfil.');
    return value;
  }
  loadCurrent(taskId: string, allowFallback = false): CheckpointV2 {
    const current = this.readCurrentId(taskId);
    if (!current) throw new DomainError('TASK_NOT_FOUND', 'Tarefa sem checkpoint v0.2.');
    try { return this.load(taskId, current); }
    catch (error) {
      this.events.emit({ event: 'checkpoint.validation_failed', run_id: null, task_id: taskId, checkpoint_id: current, attributes: { reason_code: error instanceof DomainError ? error.code : 'INVALID' } });
      if (!allowFallback) throw error;
      const fallback = this.listValid(taskId).filter(cp => cp.checkpoint_id !== current).at(-1);
      if (!fallback) throw error;
      this.events.emit({ event: 'checkpoint.fallback_loaded', run_id: fallback.run_id, task_id: taskId, checkpoint_id: current,
        attributes: { fallback_checkpoint_id: fallback.checkpoint_id, current_checkpoint_id: current } });
      return fallback;
    }
  }
  load(taskId: string, checkpointId: string): CheckpointV2 {
    const path = this.checkpointPath(taskId, checkpointId);
    if (!existsSync(path)) throw new DomainError('CHECKPOINT_NOT_FOUND', 'Checkpoint não encontrado.');
    const value = this.parseAndVerify(path);
    if (value.task_id !== taskId || value.checkpoint_id !== checkpointId) throw new DomainError('CORRUPT_CHECKPOINT', 'Identidade do checkpoint não confere com seu caminho.');
    this.events.emit({ event: 'checkpoint.loaded', run_id: value.run_id, task_id: value.task_id, checkpoint_id: value.checkpoint_id });
    return value;
  }
  private listValid(taskId: string): CheckpointV2[] {
    const directory = join(this.taskRoot(taskId), 'checkpoints');
    if (!existsSync(directory)) return [];
    const values: CheckpointV2[] = [];
    for (const name of readdirSync(directory).filter(n => /^chk_[A-Za-z0-9-]+\.json$/.test(n))) {
      try { values.push(this.parseAndVerify(join(directory, name))); } catch { /* inspect/verify reports corruption separately */ }
    }
    return values.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.checkpoint_id.localeCompare(b.checkpoint_id));
  }
  list(taskId: string): CheckpointV2[] { return this.listValid(taskId); }
  inspect(checkpointId: string): CheckpointV2 {
    const tasksRoot = join(this.stateRoot, 'profiles', this.profileId, 'tasks');
    if (!existsSync(tasksRoot)) throw new DomainError('CHECKPOINT_NOT_FOUND', 'Nenhuma tarefa nesse perfil.');
    for (const taskId of readdirSync(tasksRoot)) {
      const path = this.checkpointPath(taskId, checkpointId);
      if (existsSync(path)) return this.load(taskId, checkpointId);
    }
    throw new DomainError('CHECKPOINT_NOT_FOUND', 'Checkpoint não encontrado nesse perfil.');
  }
  verify(checkpointId: string): CheckpointVerification {
    try { const cp = this.inspect(checkpointId); return { valid: true, checkpoint_id: cp.checkpoint_id, errors: [] }; }
    catch (error) { return { valid: false, checkpoint_id: checkpointId, errors: [error instanceof DomainError ? error.code : 'VERIFY_FAILED'] }; }
  }
}
