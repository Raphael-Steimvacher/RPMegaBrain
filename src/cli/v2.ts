import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import type { NewCheckpoint, RetrievalRequest } from '../domain/v2/contracts.js';
import type { CandidateInput, ReviewDecision } from '../domain/v2/memory-store.js';
import { FilesystemCheckpointStore } from '../adapters/filesystem/checkpoint-store.js';
import { FilesystemWarmMemoryStore } from '../adapters/filesystem/warm-memory-store.js';
import { FilesystemSourceRegistry } from '../adapters/filesystem/source-registry.js';
import { ContinuityManager } from '../application/continuity/manager.js';
import { CodexEngine } from '../adapters/codex-engine.js';
import { ContextBundleStore, RetrievalPipeline } from '../application/context-building/retrieval.js';
import { RunManifestV2Store } from '../adapters/filesystem/run-manifest-v2-store.js';
import { DomainError } from '../domain/policy.js';
import { EventLogV2 } from '../infrastructure/v2/events.js';
import { parseV2File } from '../infrastructure/v2/validation.js';
import { defaultCacheRoot } from '../infrastructure/v2/paths.js';

type Args = { positionals: string[]; options: Record<string, string | true> };
function parse(argv: string[]): Args {
  const positionals: string[] = []; const options: Record<string, string | true> = {};
  const booleans = new Set(['new-thread','accept-drift','no-recovery']);
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]!;
    if (!value.startsWith('--')) { positionals.push(value); continue; }
    const key = value.slice(2); if (!key || key in options) throw new DomainError('INVALID_ARGUMENTS', `Opção duplicada ou vazia: ${value}`);
    if (booleans.has(key)) options[key] = true;
    else { const next = argv[++i]; if (!next || next.startsWith('--')) throw new DomainError('MISSING_ARGUMENT', `${value} exige valor.`); options[key] = next; }
  }
  return { positionals, options };
}
function option(args: Args, name: string, required = false): string | undefined {
  const value = args.options[name];
  if (required && typeof value !== 'string') throw new DomainError('MISSING_ARGUMENT', `Informe --${name}.`);
  return typeof value === 'string' ? value : undefined;
}
function flag(args: Args, name: string): boolean { return args.options[name] === true; }
function allow(args: Args, names: string[]): void {
  for (const name of Object.keys(args.options)) if (!names.includes(name)) throw new DomainError('UNEXPECTED_FLAG', `--${name} não se aplica a este comando.`);
}
function requirePositionals(args: Args, count: number): void { if (args.positionals.length !== count) throw new DomainError('INVALID_ARGUMENTS', 'Quantidade incorreta de argumentos.'); }
function readStructured<T>(path: string): T {
  const raw = readFileSync(path, 'utf8'); if (Buffer.byteLength(raw) > 2_000_000) throw new DomainError('INPUT_TOO_LARGE', 'Arquivo maior que 2 MB.');
  const doc = parseDocument(raw, { uniqueKeys: true }); if (doc.errors.length) throw new DomainError('INVALID_YAML', 'YAML/JSON inválido ou com chaves duplicadas.');
  return doc.toJS({ maxAliasCount: 50 }) as T;
}
function services(args: Args) {
  const profile = option(args, 'profile', true)!; const state = option(args, 'state-dir'); const cache = option(args, 'cache-dir') ?? defaultCacheRoot();
  const checkpoints = new FilesystemCheckpointStore(state, profile); const memory = new FilesystemWarmMemoryStore(state, profile, cache);
  return { profile, state, cache, checkpoints, memory, events: checkpoints.events,
    manifests: new RunManifestV2Store(checkpoints.stateRoot, profile) };
}
function registry(args: Args, profile: string, events: EventLogV2) { return new FilesystemSourceRegistry(option(args, 'registry', true)!, profile, events); }
function output(value: unknown): void { console.log(JSON.stringify(value, null, 2)); }

export async function handleV2(argv: string[]): Promise<boolean> {
  const command = argv[0];
  const recognized = ['checkpoint','memory','source','doctor','context','explain-context','run'];
  if (command === 'trace' && argv.includes('--profile')) return runTrace(parse(argv));
  if (command === 'resume' && argv.includes('--profile')) return runResume(parse(argv));
  if (!command || !recognized.includes(command)) return false;
  const args = parse(argv);
  if (command === 'checkpoint') return runCheckpoint(args);
  if (command === 'memory') return runMemory(args);
  if (command === 'source') return runSource(args);
  if (command === 'doctor') return runDoctor(args);
  if (command === 'context') return runContext(args);
  if (command === 'explain-context') return explainContext(args);
  if (command === 'run') return runCreate(args);
  return false;
}
async function runResume(args: Args): Promise<true> {
  allow(args, ['profile','state-dir','checkpoint','new-thread','accept-drift','no-recovery','engine','workspace-root','model','codex-bin']); requirePositionals(args, 2);
  const { checkpoints, events, manifests } = services(args);
  const checkpointId = option(args, 'checkpoint');
  const engine = option(args, 'engine');
  if (engine && engine !== 'codex-app-server') throw new DomainError('ENGINE_UNAVAILABLE', 'Use --engine codex-app-server ou omita o engine.');
  const workspaceRoot = option(args, 'workspace-root');
  if (engine && !workspaceRoot) throw new DomainError('CODEX_ENGINE_WORKSPACE_REQUIRED', 'Informe --workspace-root para o CodexEngine.');
  const current = checkpointId ? checkpoints.load(args.positionals[1]!, checkpointId) : checkpoints.loadCurrent(args.positionals[1]!, true);
  if (engine && current.engine.provider !== 'codex-app-server') throw new DomainError('ENGINE_MISMATCH', 'O checkpoint não foi criado para codex-app-server.');
  const model = option(args, 'model'); const codexBin = option(args, 'codex-bin');
  const threads = engine ? new CodexEngine({ workspace_root: workspaceRoot!, ...(model !== undefined ? { model } : {}), ...(codexBin !== undefined ? { codex_bin: codexBin } : {}) }) : undefined;
  const result = await new ContinuityManager(checkpoints, events, threads).resume(args.positionals[1]!, {
    ...(checkpointId ? { checkpoint_id: checkpointId } : {}), new_thread: flag(args, 'new-thread'), accept_drift: flag(args, 'accept-drift'), persist_recovery: !flag(args, 'no-recovery'),
  });
  if (!result.confirmation_required) manifests.write(result.checkpoint, { resumed: true, strategy: result.strategy });
  output(result); if (result.confirmation_required) process.exitCode = 2; return true;
}
function runCreate(args: Args): true {
  allow(args, ['profile','state-dir','file']); requirePositionals(args, 1);
  const { checkpoints, manifests } = services(args); const checkpoint = checkpoints.create(readStructured<NewCheckpoint>(option(args, 'file', true)!));
  manifests.write(checkpoint); output(checkpoint); return true;
}
function runCheckpoint(args: Args): true {
  const sub = args.positionals[1]; const { checkpoints } = services(args);
  if (sub === 'create') { allow(args, ['profile','state-dir','file','name']); requirePositionals(args, 2); const input = readStructured<NewCheckpoint>(option(args, 'file', true)!); const name = option(args, 'name'); if (name) { input.type = 'named'; input.name = name; } output(checkpoints.create(input)); }
  else if (sub === 'list') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 3); output(checkpoints.list(args.positionals[2]!)); }
  else if (sub === 'inspect') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 3); output(checkpoints.inspect(args.positionals[2]!)); }
  else if (sub === 'verify') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 3); const result = checkpoints.verify(args.positionals[2]!); output(result); if (!result.valid) process.exitCode = 1; }
  else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando checkpoint desconhecido.');
  return true;
}
function runMemory(args: Args): true {
  const sub = args.positionals[1]; const { memory } = services(args);
  if (sub === 'propose') { allow(args, ['profile','state-dir','cache-dir','file']); requirePositionals(args, 3); const input = readStructured<CandidateInput>(option(args, 'file', true)!); if (input.task_id !== args.positionals[2]) throw new DomainError('TASK_ID_MISMATCH', 'Candidato pertence a outra tarefa.'); output(memory.propose(input)); }
  else if (sub === 'candidates') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 2); output(memory.listCandidates()); }
  else if (sub === 'review') {
    allow(args, ['profile','state-dir','cache-dir','decision','expected-hash','statement-file','limits-file','tags','reason']); requirePositionals(args, 3);
    const decision = option(args, 'decision', true)!; if (!['approve','edit_and_approve','reject','defer'].includes(decision)) throw new DomainError('INVALID_DECISION', 'Decisão inválida.');
    const reason = option(args, 'reason');
    const review: ReviewDecision = { decision: decision as ReviewDecision['decision'], expected_hash: option(args, 'expected-hash', true)!, ...(reason ? { reason } : {}) };
    const statementFile = option(args, 'statement-file'); const limitsFile = option(args, 'limits-file'); const tags = option(args, 'tags');
    if (statementFile) review.edited_statement = readFileSync(statementFile, 'utf8'); if (limitsFile) review.edited_limits = readFileSync(limitsFile, 'utf8'); if (tags) review.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
    output(memory.review(args.positionals[2]!, review));
  }
  else if (sub === 'search') { allow(args, ['profile','state-dir','cache-dir','request']); requirePositionals(args, 3); output(memory.search(args.positionals[2]!, parseV2File<RetrievalRequest>(option(args, 'request', true)!, 'retrieval-request'))); }
  else if (sub === 'explain') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 3); output(memory.get(args.positionals[2]!)); }
  else if (sub === 'history') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 3); output(memory.history(args.positionals[2]!)); }
  else if (sub === 'conflicts') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 2); output(memory.listRecords().filter(r => r.status === 'quarantined' || r.conflicts_with.length)); }
  else if (sub === 'expire') { allow(args, ['profile','state-dir','cache-dir','at']); requirePositionals(args, 2); output(memory.expire(option(args, 'at'))); }
  else if (sub === 'revoke') { allow(args, ['profile','state-dir','cache-dir','expected-hash','reason']); requirePositionals(args, 3); output(memory.revoke(args.positionals[2]!, option(args, 'expected-hash', true)!, option(args, 'reason', true)!)); }
  else if (sub === 'forget') { allow(args, ['profile','state-dir','cache-dir','expected-hash','reason']); requirePositionals(args, 3); output(memory.forget(args.positionals[2]!, option(args, 'expected-hash', true)!, option(args, 'reason', true)!)); }
  else if (sub === 'rebuild-index') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 2); output({ indexed: memory.rebuildIndex() }); }
  else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando memory desconhecido.');
  return true;
}
function runSource(args: Args): true {
  const sub = args.positionals[1]; const { profile, events } = services(args); const sources = registry(args, profile, events);
  if (sub === 'list') { allow(args, ['profile','state-dir','cache-dir','registry']); requirePositionals(args, 2); output(sources.list()); }
  else if (sub === 'inspect') { allow(args, ['profile','state-dir','cache-dir','registry']); requirePositionals(args, 3); output(sources.inspect(args.positionals[2]!)); }
  else if (sub === 'doctor') { allow(args, ['profile','state-dir','cache-dir','registry']); requirePositionals(args, 3); output(sources.doctor(args.positionals[2]!)); }
  else if (sub === 'search') { allow(args, ['profile','state-dir','cache-dir','registry','workflow','sensitivity']); requirePositionals(args, 4); output(sources.search(args.positionals[2]!, args.positionals[3]!, option(args, 'workflow', true)!, option(args, 'sensitivity') ?? 'confidential')); }
  else if (sub === 'snapshot') { allow(args, ['profile','state-dir','cache-dir','registry']); requirePositionals(args, 3); output(sources.snapshot(args.positionals[2]!)); }
  else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando source desconhecido.');
  return true;
}
function runDoctor(args: Args): true {
  const sub = args.positionals[1]; const { memory, checkpoints } = services(args);
  if (sub === 'memory') { allow(args, ['profile','state-dir','cache-dir']); requirePositionals(args, 2); const records = memory.listRecords(); output({ records: records.length, indexed: memory.rebuildIndex(), quarantined: records.filter(r => r.status === 'quarantined').length, candidates_pending: memory.listCandidates().filter(c => c.status === 'pending').length }); }
  else if (sub === 'continuity') { allow(args, ['profile','state-dir','cache-dir','task']); requirePositionals(args, 2); const task = option(args, 'task', true)!; const items = checkpoints.list(task); output({ task_id: task, checkpoints: items.length, current: items.at(-1)?.checkpoint_id ?? null, valid: items.every(cp => checkpoints.verify(cp.checkpoint_id).valid) }); }
  else throw new DomainError('UNKNOWN_COMMAND', 'Use doctor memory ou doctor continuity.');
  return true;
}
function runContext(args: Args): true {
  if (args.positionals[1] !== 'build') throw new DomainError('UNKNOWN_COMMAND', 'Use context build.');
  allow(args, ['profile','state-dir','cache-dir','request','registry']); requirePositionals(args, 2);
  const { profile, state, memory, events, manifests } = services(args); const request = parseV2File<RetrievalRequest>(option(args, 'request', true)!, 'retrieval-request');
  const registryPath = option(args, 'registry'); const sources = registryPath ? new FilesystemSourceRegistry(registryPath, profile, events) : null;
  const bundle = new RetrievalPipeline(memory, sources, new ContextBundleStore(state), events).build(request);
  if (manifests.has(bundle.run_id)) manifests.attachContext(bundle.run_id, bundle);
  output(bundle); return true;
}
function explainContext(args: Args): true {
  allow(args, ['profile','state-dir']); requirePositionals(args, 2); const profile = option(args, 'profile', true)!;
  output(new ContextBundleStore(option(args, 'state-dir')).loadCurrent(profile, args.positionals[1]!)); return true;
}
function runTrace(args: Args): true {
  if (args.positionals[1] !== 'show') throw new DomainError('UNKNOWN_COMMAND', 'Use trace show RUN_ID.');
  allow(args, ['profile','state-dir','cache-dir','section']); requirePositionals(args, 3);
  const { events } = services(args); const runId = args.positionals[2]!; const section = option(args, 'section');
  const prefixes: Record<string, string[]> = { retrieval: ['retrieval.','context.','memory.selected','source.selected'], continuity: ['checkpoint.','continuity.'], memory: ['memory.','secret.','persistence.'], sources: ['source.'] };
  if (section && !(section in prefixes)) throw new DomainError('INVALID_SECTION', 'Seção deve ser retrieval, continuity, memory ou sources.');
  const eventsForRun = events.read().filter(event => event.run_id === runId && (!section || prefixes[section]!.some(prefix => event.event.startsWith(prefix))));
  output(eventsForRun); return true;
}
