import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CodexHookJournalStore, renderCodexHooks } from '../infrastructure/codex-hooks.js';
import { hash, stableJson } from '../infrastructure/hashing.js';
import { DomainError } from '../domain/policy.js';
import { CodexEvidenceAssembler } from '../application/codex-hooks/evidence.js';

const required = (value: string | undefined, name: string): string => { if (!value) throw new DomainError('MISSING_ARGUMENT', `Informe ${name}.`); return value; };
const output = (value: unknown): void => console.log(JSON.stringify(value, null, 2));
export async function handleCodexHooks(argv: string[]): Promise<boolean> {
  if (argv[0] !== 'codex') return false;
  const { values, positionals } = parseArgs({ args: argv.slice(1), allowPositionals: true, strict: true, options: { profile: { type: 'string' }, repository: { type: 'string' }, 'config-hash': { type: 'string' }, 'state-dir': { type: 'string' }, 'session': { type: 'string' }, contract: { type: 'string' }, run: { type: 'string' } } });
  const [area, action] = positionals; const profile = required(values.profile as string | undefined, '--profile'); const repository = values.repository as string | undefined; const store = new CodexHookJournalStore(values['state-dir'] as string | undefined, profile);
  if (area === 'evidence' && action === 'build') { output(new CodexEvidenceAssembler(values['state-dir'] as string | undefined, profile).build(required(values.contract as string | undefined, '--contract'), required(values.session as string | undefined, '--session'), required(values.run as string | undefined, '--run'))); return true; }
  const repo = required(repository, '--repository');
  if (area === 'hooks' && action === 'render') { const config = renderCodexHooks(process.argv[1]!, profile, repo, values['state-dir'] as string | undefined); output({ config, config_hash: hash(stableJson(config)) }); return true; }
  if (area === 'hooks' && action === 'register') { output(store.register(repo, required(values['config-hash'] as string | undefined, '--config-hash'))); return true; }
  if (area === 'hook' && action === 'ingest') {
    try { store.ingest(repo, JSON.parse(readFileSync(0, 'utf8'))); } catch (error) { if (!(error instanceof DomainError) || !['HOOK_INPUT_REJECTED', 'HOOK_NOT_ACTIVE', 'HOOK_EVENT_AFTER_SEAL'].includes(error.code)) throw error; }
    return true;
  }
  if (area === 'sessions' && action === 'list') { output(store.sessions()); return true; }
  if (area === 'sessions' && action === 'inspect') { output(store.list(required(values.session as string | undefined, '--session'))); return true; }
  if (area === 'sessions' && action === 'seal') { output(store.seal(required(values.session as string | undefined, '--session'))); return true; }
  if (area === 'hooks' && action === 'status') { output({ state_root: store.root, registration: store.registration(repo) }); return true; }
  throw new DomainError('UNKNOWN_COMMAND', 'Use codex hooks render|register|status, codex hook ingest ou codex sessions list|inspect|seal.');
}
