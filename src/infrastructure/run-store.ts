import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { stringify } from 'yaml';
import type { Checkpoint } from '../domain/contracts.js';
import { DomainError } from '../domain/policy.js';
import { coreRoot, validate } from './validation.js';

export function defaultStateRoot(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (env.MEGABRAIN_STATE_HOME) return resolve(env.MEGABRAIN_STATE_HOME);
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'megabrain');
  const xdg = env.XDG_STATE_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.local', 'state'), 'megabrain');
}
function within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
function assertOrdinaryPath(path: string): void {
  let current = resolve(path);
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new DomainError('UNSAFE_STATE_PATH', 'Estado não pode usar symlink ou junction.');
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
export function assertCheckpoint(checkpoint: Checkpoint): void {
  validate<Checkpoint>('checkpoint', checkpoint);
  const { manifest, state, task, profile } = checkpoint;
  if (manifest.run_id !== state.active_run_id || manifest.task_id !== state.task_id || state.task_id !== task.task_id ||
      manifest.execution.profile !== profile.id || profile.classification !== 'synthetic' ||
      (checkpoint.evaluation && checkpoint.evaluation.run_id !== manifest.run_id)) {
    throw new DomainError('CORRUPT_CHECKPOINT', 'Identidades inconsistentes no checkpoint.');
  }
  checkpoint.events.forEach((event, index) => {
    if (event.sequence !== index + 1 || event.run_id !== manifest.run_id || event.task_id !== task.task_id) {
      throw new DomainError('CORRUPT_CHECKPOINT', 'Sequência ou identidade inconsistente no trace.');
    }
  });
}
export class RunStore {
  readonly root: string;
  constructor(root = defaultStateRoot()) {
    this.root = resolve(root);
    if (within(coreRoot, this.root)) throw new DomainError('STATE_IN_REPOSITORY', 'Escolha um diretório de estado fora do núcleo.');
    let candidate = this.root;
    while (true) {
      if (existsSync(join(candidate, '.git'))) throw new DomainError('STATE_IN_REPOSITORY', 'Estado deve ficar fora de repositórios Git.');
      const parent = dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
    }
    assertOrdinaryPath(this.root);
  }
  path(runId: string): string {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId)) {
      throw new DomainError('INVALID_RUN_ID', 'Run ID deve ser um UUID válido.');
    }
    const result = join(this.root, 'profiles', 'synthetic', 'runs', runId);
    assertOrdinaryPath(result);
    return result;
  }
  initialize(runId: string): void {
    const target = this.path(runId);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    mkdirSync(target, { mode: 0o700 });
  }
  async locked<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const lockPath = join(this.path(runId), '.lock');
    try { mkdirSync(lockPath, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DomainError('RUN_BUSY', 'Run em uso. Se houve encerramento abrupto, siga a recuperação de lock no README.');
      throw error;
    }
    try { return await fn(); } finally { rmdirSync(lockPath); }
  }
  read(runId: string): Checkpoint {
    const root = this.path(runId);
    if (!existsSync(root)) throw new DomainError('RUN_NOT_FOUND', 'Run não encontrado neste diretório de estado.');
    const revisions = readdirSync(root).filter(name => /^\d{8}$/.test(name)).sort();
    const latest = revisions.at(-1);
    if (!latest) throw new DomainError('MISSING_CHECKPOINT', 'Run sem checkpoint completo.');
    const path = join(root, latest, 'checkpoint.json');
    assertOrdinaryPath(path);
    let value: Checkpoint;
    try { value = JSON.parse(readFileSync(path, 'utf8')) as Checkpoint; }
    catch { throw new DomainError('CORRUPT_CHECKPOINT', 'Checkpoint ilegível; revisões anteriores foram preservadas.'); }
    assertCheckpoint(value);
    if (value.manifest.run_id !== runId || value.storage_revision !== Number(latest)) {
      throw new DomainError('CORRUPT_CHECKPOINT', 'Revisão ou run ID não corresponde ao diretório.');
    }
    return value;
  }
  // Caller holds the per-run lock. The completed directory rename publishes the revision.
  commit(checkpoint: Checkpoint): void {
    const next = structuredClone(checkpoint);
    next.storage_revision += 1;
    assertCheckpoint(next);
    const root = this.path(next.manifest.run_id);
    if (!existsSync(join(root, '.lock'))) throw new DomainError('LOCK_REQUIRED', 'Escrita exige lock do run.');
    const temporary = join(root, `.pending-${randomUUID()}`);
    const destination = join(root, String(next.storage_revision).padStart(8, '0'));
    if (existsSync(destination)) throw new DomainError('STALE_CHECKPOINT', 'Esta revisão já existe. Recarregue o run.');
    mkdirSync(temporary, { mode: 0o700 });
    const put = (name: string, content: string) => writeFileSync(join(temporary, name), content, { flag: 'wx', mode: 0o600 });
    try {
      put('checkpoint.json', JSON.stringify(next, null, 2) + '\n');
      put('run-manifest.yaml', stringify(next.manifest));
      put('task-state.yaml', stringify(next.state));
      put('trace.jsonl', next.events.map(event => JSON.stringify(event)).join('\n') + '\n');
      put('result.md', next.artifacts.result);
      if (next.evaluation) put('evaluation.yaml', stringify(next.evaluation));
      renameSync(temporary, destination);
      checkpoint.storage_revision = next.storage_revision;
    } catch (error) {
      // Only this transaction's generated directory; never a user-supplied deletion path.
      if (within(root, temporary) && existsSync(temporary)) rmSync(temporary, { recursive: true });
      throw error;
    }
  }
}
