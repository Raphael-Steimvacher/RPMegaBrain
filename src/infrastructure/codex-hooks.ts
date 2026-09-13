import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { atomicWrite, withDirectoryLock } from './v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from './v2/paths.js';
import { defaultStateRoot, RunStore } from './run-store.js';
import { hash, stableJson } from './hashing.js';
import { DomainError } from '../domain/policy.js';
import { codexHookEvents, type CodexHookEvent, type CodexHookTelemetryV1, type HookRegistrationV1, type HookSealV1 } from '../domain/codex-hooks.js';

const events = new Set<string>(codexHookEvents);
const modes = new Set(['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions']);
const sources = new Set(['startup', 'resume', 'clear', 'compact']);
const bounded = (value: unknown, limit = 120): string | null => typeof value === 'string' && value.length > 0 && value.length <= limit ? value : null;
function timestamp(value: unknown): string { if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new DomainError('HOOK_INPUT_REJECTED', 'Evento de hook sem timestamp válido.'); return new Date(value).toISOString(); }
function readJson<T>(path: string): T | null { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : null; }

export class CodexHookJournalStore {
  readonly root: string;
  private readonly base: string;
  constructor(stateRoot = defaultStateRoot(), readonly profileId: string) {
    assertIdentifier(profileId, 'profile_id'); this.root = new RunStore(stateRoot).root; this.base = join(this.root, 'profiles', profileId, 'codex-hooks');
    ensurePrivateDirectory(this.base); ensurePrivateDirectory(join(this.base, 'registrations')); ensurePrivateDirectory(join(this.base, 'sessions')); ensurePrivateDirectory(join(this.base, 'locks')); ensurePrivateDirectory(join(this.base, 'secrets'));
  }
  private salt(): Buffer { const path = join(this.base, 'secrets', 'session-hash-salt'); if (!existsSync(path)) atomicWrite(path, randomBytes(32).toString('hex') + '\n'); return Buffer.from(readFileSync(path, 'utf8').trim(), 'hex'); }
  private ref(value: string | null): string | null { return value === null ? null : createHmac('sha256', this.salt()).update(value).digest('hex'); }
  private registrationPath(repositoryId: string): string { return join(this.base, 'registrations', `${assertIdentifier(repositoryId, 'repository_id')}.json`); }
  register(repositoryId: string, configHash: string): HookRegistrationV1 {
    assertIdentifier(repositoryId, 'repository_id'); if (!/^sha256:[a-f0-9]{64}$/.test(configHash)) throw new DomainError('INVALID_DOCUMENT', 'Hash da configuração inválido.');
    const value: HookRegistrationV1 = { schema_version: 1, repository_id: repositoryId, profile_id: this.profileId, config_hash: configHash, installed_at: new Date().toISOString() };
    const path = this.registrationPath(repositoryId); const prior = readJson<HookRegistrationV1>(path); if (prior && prior.config_hash !== configHash) throw new DomainError('HOOK_CONFIG_DRIFT', 'Registro de hook já existe com outro hash.');
    if (!prior) atomicWrite(path, JSON.stringify(value) + '\n'); return prior ?? value;
  }
  registration(repositoryId: string): HookRegistrationV1 { const value = readJson<HookRegistrationV1>(this.registrationPath(repositoryId)); if (!value || value.profile_id !== this.profileId) throw new DomainError('HOOK_NOT_ACTIVE', 'Hook não registrado para este profile.'); return value; }
  private eventsPath(sessionRef: string): string { return join(this.base, 'sessions', sessionRef, 'events.jsonl'); }
  private sealPath(sessionRef: string): string { return join(this.base, 'sessions', sessionRef, 'seal.json'); }
  private readEvents(sessionRef: string): CodexHookTelemetryV1[] { const path = this.eventsPath(sessionRef); return existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as CodexHookTelemetryV1) : []; }
  ingest(repositoryId: string, raw: unknown): CodexHookTelemetryV1 {
    this.registration(repositoryId); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DomainError('HOOK_INPUT_REJECTED', 'Envelope de hook inválido.');
    const input = raw as Record<string, unknown>; const hookEvent = bounded(input.hook_event_name, 40) as CodexHookEvent | null; const sessionId = bounded(input.session_id, 300);
    if (!hookEvent || !events.has(hookEvent) || !sessionId) throw new DomainError('HOOK_INPUT_REJECTED', 'Evento ou sessão de hook inválidos.');
    const observedAt = timestamp(input.timestamp ?? new Date().toISOString()); const sessionRef = this.ref(sessionId)!; const turnRef = this.ref(bounded(input.turn_id, 300)); const toolRef = this.ref(bounded(input.tool_use_id, 300));
    const tool = bounded(input.tool_name); const mode = bounded(input.permission_mode); const source = bounded(input.source, 20);
    const permissionMode = mode && modes.has(mode) ? mode : null; const sessionSource = source && sources.has(source) ? source as CodexHookTelemetryV1['session_source'] : null;
    const eventKey = stableJson({ sessionRef, hookEvent, turnRef, toolRef, observedAt }); const eventId = hash(eventKey);
    const lock = join(this.base, 'locks', `${sessionRef}.lock`);
    return withDirectoryLock(lock, () => {
      if (existsSync(this.sealPath(sessionRef))) throw new DomainError('HOOK_EVENT_AFTER_SEAL', 'Sessão já foi selada.');
      const prior = this.readEvents(sessionRef); const duplicate = prior.find(event => event.event_id === eventId); if (duplicate) return duplicate;
      const value: CodexHookTelemetryV1 = { schema_version: 1, event_id: eventId, sequence_id: prior.length + 1, observed_at: observedAt, repository_id: repositoryId, profile_id: this.profileId, session_ref: sessionRef, turn_ref: turnRef, tool_call_ref: toolRef, hook_event: hookEvent, tool_name: tool, permission_mode: permissionMode, model: bounded(input.model), session_source: sessionSource, status: 'success', reason_code: null };
      atomicWrite(this.eventsPath(sessionRef), [...prior, value].map(event => JSON.stringify(event)).join('\n') + '\n'); return value;
    });
  }
  list(sessionRef: string): CodexHookTelemetryV1[] { assertIdentifier(sessionRef, 'session_ref'); return this.readEvents(sessionRef); }
  sessions(): string[] { const root = join(this.base, 'sessions'); return readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort(); }
  seal(sessionRef: string): HookSealV1 { assertIdentifier(sessionRef, 'session_ref'); return withDirectoryLock(join(this.base, 'locks', `${sessionRef}.lock`), () => { const current = readJson<HookSealV1>(this.sealPath(sessionRef)); if (current) return current; const records = this.readEvents(sessionRef); const value: HookSealV1 = { schema_version: 1, session_ref: sessionRef, event_count: records.length, journal_hash: hash(stableJson(records)), sealed_at: new Date().toISOString() }; atomicWrite(this.sealPath(sessionRef), JSON.stringify(value) + '\n'); return value; }); }
}

export function renderCodexHooks(entrypoint: string, profileId: string, repositoryId: string, stateRoot?: string): Record<string, unknown> {
  assertIdentifier(profileId, 'profile_id'); assertIdentifier(repositoryId, 'repository_id');
  const state = stateRoot ? ` --state-dir ${JSON.stringify(stateRoot)}` : '';
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(entrypoint)} codex hook ingest --profile ${JSON.stringify(profileId)} --repository ${JSON.stringify(repositoryId)}${state}`;
  const handlers = Object.fromEntries(codexHookEvents.map(event => [event, [{ hooks: [{ type: 'command', command, timeout: 1 }] }]]));
  return { description: 'MegaBrain telemetry only; no content persistence or policy enforcement.', hooks: handlers };
}
