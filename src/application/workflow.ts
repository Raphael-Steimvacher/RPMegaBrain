import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Approval, Checkpoint, Evaluation, EventName, Mode, Profile, Stage, State, TaskInput } from '../domain/contracts.js';
import { DomainError, gateImplementation, requireApproval, transition } from '../domain/policy.js';
import { MockEngine, type AgentEngine } from '../adapters/mock.js';
import { hash, stableJson } from '../infrastructure/hashing.js';
import { redact, redactionPolicy, safeAttributes } from '../infrastructure/privacy.js';
import { coreRoot, parseFile, validate } from '../infrastructure/validation.js';
import { RunStore } from '../infrastructure/run-store.js';
import { runtimeFingerprint } from '../infrastructure/integrity.js';

const now = () => new Date().toISOString();
function emit(cp: Checkpoint, event: EventName, attrs: Record<string, unknown> = {}, outcome: 'success' | 'failure' | 'blocked' = 'success'): void {
  cp.events.push({ schema_version: 1, timestamp: now(), sequence: cp.events.length + 1,
    run_id: cp.manifest.run_id, task_id: cp.task.task_id, producer: 'megabrain.wrapper', event_name: event,
    phase: cp.manifest.execution.stage, outcome, duration_ms: 0, attributes: safeAttributes(attrs) });
}
function change(cp: Checkpoint, state: State, nextAction: string): void {
  const from = cp.state.state;
  cp.state.state = transition(from, state);
  cp.state.next_action = nextAction;
  emit(cp, 'task.state_changed', { from_state: from, to_state: state });
}
function policyComponents(mode: Mode) {
  return ['base', mode].map(id => ({ id, hash: hash(readFileSync(join(coreRoot, 'policies', `${id}.yaml`), 'utf8')) }));
}
function configHash(task: TaskInput, profile: Profile, mode: Mode): string {
  return hash(stableJson({ task, profile, policies: policyComponents(mode), code: runtimeFingerprint(coreRoot) }));
}
export function scoreEvaluation(evaluation: Evaluation): number {
  const s = evaluation.scores;
  return Math.round((s.technical_correctness * .35 + s.requirement_coverage * .25 + s.actionability * .2 + s.teaching_clarity * .1 + s.efficiency * .1) * 100) / 100;
}
export class Workflow {
  constructor(readonly store: RunStore, private readonly engine: AgentEngine = new MockEngine()) {}
  async create(task: TaskInput, profileId: string, mode: Mode): Promise<Checkpoint> {
    validate('task-input', task);
    if (profileId !== 'synthetic') throw new DomainError('PROFILE_UNAVAILABLE', 'Alpha.1 aceita apenas --profile synthetic; overlays entram no Marco 2.');
    gateImplementation(mode, { status: 'pending', artifact_hash: hash('') }, '');
    const profile = parseFile<Profile>(join(coreRoot, 'profiles/synthetic.json'), 'profile');
    const runId = randomUUID();
    if (redact(task.task_id) !== task.task_id) throw new DomainError('SENSITIVE_TASK_ID', 'Use um identificador sem credenciais ou dados sensíveis.');
    const sanitizedTask: TaskInput = { ...task, title: redact(task.title), description: redact(task.description),
      acceptance_criteria: task.acceptance_criteria.map(redact) };
    const pending = (): Approval => ({ status: 'pending', artifact_hash: hash('') });
    let commit: string | null = null;
    try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: coreRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* A source archive is supported. */ }
    const cp: Checkpoint = {
      schema_version: 1, storage_revision: 0, task: sanitizedTask, profile,
      manifest: { schema_version: 1, telemetry_schema_version: 1, run_id: runId, task_id: task.task_id, run_revision: 1, started_at: now(),
        harness: { version: readFileSync(join(coreRoot, 'VERSION'), 'utf8').trim(), commit, config_hash: configHash(sanitizedTask, profile, mode) },
        engine: { provider: 'local', adapter: 'mock', sdk_version: null, model: 'synthetic', reasoning_effort: null, thread_id: null },
        execution: { profile: 'synthetic', workflow: 'wac', stage: 'definition', mode, sandbox: 'not-applicable', simulated: true },
        components: { policies: policyComponents(mode), skills: [] }, sources: [],
        privacy: { prompt_content_recorded: false, tool_content_recorded: false, redaction_policy_hash: hash(redactionPolicy) } },
      state: { schema_version: 1, task_id: task.task_id, active_run_id: runId, state: 'created', definition: pending(), plan: pending(), next_action: 'resume' },
      artifacts: { definition: '', plan: '', result: '' }, events: [], evaluation: null,
    };
    emit(cp, 'run.started', { simulated: true, engine: 'mock' });
    emit(cp, 'profile.selected', { profile_id: profile.id });
    emit(cp, 'workflow.selected');
    emit(cp, 'policy.composed', { mode, simulated: true });
    this.store.initialize(runId);
    await this.store.locked(runId, async () => { this.store.commit(cp); });
    return this.resume(runId);
  }
  private async mutate(runId: string, fn: (cp: Checkpoint) => Promise<void>): Promise<Checkpoint> {
    return this.store.locked(runId, async () => {
      const original = this.store.read(runId);
      const cp = structuredClone(original);
      try {
        if (cp.manifest.harness.config_hash !== configHash(cp.task, cp.profile, cp.manifest.execution.mode)) {
          throw new DomainError('CONFIG_CHANGED', 'Configuração/runtime mudou. Inicie um novo run; migração de snapshot entra no Marco 3.');
        }
        await fn(cp);
      } catch (error) {
        const cancelled = error instanceof Error && error.name === 'AbortError';
        const blocked = error instanceof DomainError;
        emit(original, cancelled ? 'engine.cancelled' : blocked ? 'policy.blocked' : 'run.failed',
          { reason_code: blocked ? error.code : cancelled ? 'CANCELLED' : 'ENGINE_ERROR' }, blocked ? 'blocked' : 'failure');
        this.store.commit(original);
        throw error;
      }
      this.store.commit(cp);
      return cp;
    });
  }
  private async runStage(cp: Checkpoint, stage: Stage, signal?: AbortSignal): Promise<string> {
    cp.manifest.execution.stage = stage;
    const thread = cp.manifest.engine.thread_id;
    const input = { task: cp.task, stage, ...(signal ? { signal } : {}) };
    const result = thread ? await this.engine.resume({ ...input, thread_id: thread }) : await this.engine.start(input);
    cp.manifest.engine.thread_id = result.thread_id;
    cp.artifacts.result = redact(result.output);
    emit(cp, thread ? 'engine.thread_resumed' : 'engine.thread_started', { thread_id: result.thread_id, simulated: true });
    emit(cp, 'engine.completed', { simulated: true });
    return cp.artifacts.result;
  }
  async resume(runId: string, requestedMode?: Mode, signal?: AbortSignal): Promise<Checkpoint> {
    return this.mutate(runId, async cp => {
      // Every write-capable continuation requires explicit user input again.
      const mode = requestedMode ?? 'teach';
      gateImplementation(mode, cp.state.plan, cp.artifacts.plan);
      if (mode === 'implement' && cp.state.state !== 'plan_ready') throw new DomainError('INVALID_IMPLEMENT_STAGE', 'Implementação só pode começar em plan_ready.');
      if (cp.manifest.execution.mode !== mode) {
        cp.manifest.execution.mode = mode;
        cp.manifest.components.policies = policyComponents(mode);
        cp.manifest.harness.config_hash = configHash(cp.task, cp.profile, mode);
        emit(cp, 'mode.changed', { mode, simulated: true });
      }
      cp.manifest.run_revision += cp.state.state === 'created' ? 0 : 1;
      switch (cp.state.state) {
        case 'created':
          cp.artifacts.definition = await this.runStage(cp, 'definition', signal);
          cp.state.definition = { status: 'pending', artifact_hash: hash(cp.artifacts.definition) };
          change(cp, 'defined', 'approve definition');
          break;
        case 'defined':
          requireApproval(cp.state.definition, cp.artifacts.definition);
          await this.runStage(cp, 'investigation', signal);
          change(cp, 'investigating', 'resume');
          break;
        case 'investigating':
          cp.artifacts.plan = await this.runStage(cp, 'planning', signal);
          cp.state.plan = { status: 'pending', artifact_hash: hash(cp.artifacts.plan) };
          change(cp, 'plan_ready', 'approve plan');
          break;
        case 'plan_ready':
          requireApproval(cp.state.plan, cp.artifacts.plan);
          if (mode === 'implement') {
            await this.runStage(cp, 'implementation', signal);
            change(cp, 'implementing', 'review');
          } else {
            cp.artifacts.result = cp.artifacts.plan + '\n\nCheckpoint: implemente a fixture e use review.\n';
            change(cp, 'awaiting_user_code', 'review');
          }
          break;
        case 'reviewing':
          requireApproval(cp.state.plan, cp.artifacts.plan);
          cp.manifest.execution.stage = 'verification';
          emit(cp, 'verification.completed', { simulated: true, check_count: 1 });
          cp.artifacts.result = 'Verificação do harness: hash do plano aprovado confere.\nNenhum teste de código foi executado. Avalie apenas a simulação.\n';
          change(cp, 'verified', 'eval');
          break;
        default: throw new DomainError('CHECKPOINT_ACTION_REQUIRED', `Estado ${cp.state.state}: use ${cp.state.next_action}.`);
      }
    });
  }
  async approve(runId: string, artifact: 'definition' | 'plan', expectedHash: string): Promise<Checkpoint> {
    return this.mutate(runId, async cp => {
      const expectedState = artifact === 'definition' ? 'defined' : 'plan_ready';
      if (cp.state.state !== expectedState) throw new DomainError('INVALID_APPROVAL_STAGE', 'Artefato não está aguardando aprovação.');
      const actual = hash(cp.artifacts[artifact]);
      if (actual !== expectedHash) throw new DomainError('STALE_APPROVAL', 'O hash informado não corresponde ao artefato atual.');
      cp.state[artifact] = { status: 'approved', artifact_hash: actual, approved_by: 'user', approved_at: now() };
      cp.state.next_action = 'resume';
      emit(cp, 'approval.recorded', { artifact, artifact_hash: actual });
    });
  }
  async review(runId: string): Promise<Checkpoint> {
    return this.mutate(runId, async cp => {
      if (!['awaiting_user_code', 'implementing'].includes(cp.state.state)) throw new DomainError('INVALID_REVIEW_STAGE', 'A revisão requer o checkpoint de implementação.');
      requireApproval(cp.state.plan, cp.artifacts.plan);
      if (cp.manifest.execution.mode !== 'teach') {
        cp.manifest.execution.mode = 'teach';
        cp.manifest.run_revision += 1;
        cp.manifest.components.policies = policyComponents('teach');
        cp.manifest.harness.config_hash = configHash(cp.task, cp.profile, 'teach');
        emit(cp, 'mode.changed', { mode: 'teach', simulated: true });
      }
      await this.runStage(cp, 'review');
      change(cp, 'reviewing', 'resume');
    });
  }
  async evaluate(runId: string, evaluation: Evaluation): Promise<Checkpoint> {
    return this.mutate(runId, async cp => {
      validate('evaluation', evaluation);
      if (evaluation.run_id !== runId) throw new DomainError('EVALUATION_RUN_MISMATCH', 'Avaliação pertence a outro run.');
      if (cp.state.state !== 'verified') throw new DomainError('INVALID_EVALUATION_STAGE', 'Avaliação final requer estado verified.');
      cp.evaluation = { ...evaluation, user_notes: redact(evaluation.user_notes), corrections: evaluation.corrections.map(c => ({ ...c, note: redact(c.note) })) };
      cp.manifest.execution.stage = 'evaluation';
      emit(cp, 'evaluation.recorded', { verdict: evaluation.verdict, hard_failure_count: evaluation.hard_failures.length,
        weighted_score: evaluation.hard_failures.length ? null : scoreEvaluation(evaluation) });
      change(cp, 'evaluated', 'finished');
      emit(cp, 'run.completed', { verdict: evaluation.verdict, simulated: true });
    });
  }
}
