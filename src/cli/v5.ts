import { readFileSync } from 'node:fs';
import { DomainError } from '../domain/policy.js';
import type { CandidateDecision, CandidateMode } from '../domain/v5/contracts.js';
import { CandidateService } from '../application/candidates/service.js';

type Value = string | boolean;
type Args = { positionals: string[]; options: Record<string, Value> };

function parse(argv: string[]): Args {
  const positionals: string[] = []; const options: Record<string, Value> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (!item.startsWith('--')) { positionals.push(item); continue; }
    const key = item.slice(2); if (!key || key in options) throw new DomainError('INVALID_ARGUMENTS', `Opção inválida: ${item}`);
    const next = argv[index + 1]; if (next && !next.startsWith('--')) { options[key] = next; index += 1; } else options[key] = true;
  }
  return { positionals, options };
}
function option(args: Args, name: string, required = false): string | undefined { const value = args.options[name]; if (required && (typeof value !== 'string' || !value)) throw new DomainError('MISSING_ARGUMENT', `Informe --${name}.`); return typeof value === 'string' ? value : undefined; }
function flag(args: Args, name: string): boolean { return args.options[name] === true; }
function allow(args: Args, names: string[]): void { for (const name of Object.keys(args.options)) if (!names.includes(name)) throw new DomainError('UNEXPECTED_FLAG', `--${name} não se aplica a este comando.`); }
function positions(args: Args, count: number): void { if (args.positionals.length !== count) throw new DomainError('INVALID_ARGUMENTS', 'Quantidade incorreta de argumentos.'); }
function output(value: unknown): true { console.log(JSON.stringify(value, null, 2)); return true; }
function service(args: Args): CandidateService { return new CandidateService(option(args, 'state-dir'), option(args, 'profile', true)!); }
function duration(value: string): number { const match = /^(\d+)(s|m|h)?$/.exec(value); if (!match) throw new DomainError('INVALID_EXPIRY', 'Use duração como 30m, 2h ou segundos.'); const amount = Number(match[1]); return amount * (match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1); }
function decision(value: string): CandidateDecision['decision'] { const values: CandidateDecision['decision'][] = ['AcceptedForManualIntegration', 'ChangesRequested', 'Rejected', 'Deferred', 'NeedsEvidence']; if (!values.includes(value as CandidateDecision['decision'])) throw new DomainError('INVALID_DECISION', 'Decisão humana inválida.'); return value as CandidateDecision['decision']; }

export async function handleV5(argv: string[]): Promise<boolean> {
  if (argv[0] !== 'candidate') return false;
  const args = parse(argv); const sub = args.positionals[1]; const app = service(args);
  if (sub === 'request') { allow(args, ['profile', 'state-dir', 'proposal', 'repo', 'paths', 'base', 'mode']); positions(args, 2); const mode = (option(args, 'mode') ?? 'dry-run') as CandidateMode; if (!['disabled', 'dry-run', 'shadow', 'supervised'].includes(mode)) throw new DomainError('INVALID_MODE', 'Modo v0.5 inválido.'); return output(app.request(option(args, 'proposal', true)!, option(args, 'repo', true)!, [option(args, 'paths', true)!], mode, option(args, 'base'))); }
  if (sub === 'plan') { allow(args, ['profile', 'state-dir']); positions(args, 3); return output(app.plan(args.positionals[2]!)); }
  if (sub === 'authorize') { allow(args, ['profile', 'state-dir', 'expires-in']); positions(args, 3); return output(app.authorize(args.positionals[2]!, duration(option(args, 'expires-in', true)!))); }
  if (sub === 'authorize-freeze') { allow(args, ['profile', 'state-dir', 'expires-in']); positions(args, 3); return output(app.authorizeFreeze(args.positionals[2]!, duration(option(args, 'expires-in', true)!))); }
  if (sub === 'create') { allow(args, ['profile', 'state-dir']); positions(args, 3); return output(app.create(args.positionals[2]!)); }
  if (sub === 'status') { allow(args, ['profile', 'state-dir']); positions(args, 3); return output(app.show(args.positionals[2]!)); }
  if (sub === 'diff' || sub === 'scope-check') { allow(args, ['profile', 'state-dir']); positions(args, 3); return output(app.scope(args.positionals[2]!)); }
  if (sub === 'build') { allow(args, ['profile', 'state-dir', 'pode-fazer', 'patch-file']); positions(args, 3); if (!flag(args, 'pode-fazer')) throw new DomainError('AUTHORIZATION_REQUIRED', 'Use --pode-fazer para editar a candidate.'); return output(app.build(args.positionals[2]!, true, option(args, 'patch-file', true)!)); }
  if (sub === 'freeze') { allow(args, ['profile', 'state-dir', 'pode-fazer']); positions(args, 3); if (!flag(args, 'pode-fazer')) throw new DomainError('AUTHORIZATION_REQUIRED', 'Use --pode-fazer para congelar a candidate.'); return output(app.freeze(args.positionals[2]!, true)); }
  if (sub === 'eval') { allow(args, ['profile', 'state-dir']); positions(args, 3); return output(app.evaluate(args.positionals[2]!)); }
  if (sub === 'review') { allow(args, ['profile', 'state-dir']); positions(args, 3); return output(app.review(args.positionals[2]!)); }
  if (sub === 'report') { allow(args, ['profile', 'state-dir']); positions(args, 3); return output(app.report(args.positionals[2]!)); }
  if (sub === 'decide' || sub === 'accept' || sub === 'reject' || sub === 'defer') {
    allow(args, ['profile', 'state-dir', 'decision', 'report-hash', 'reason']); positions(args, 3); const selected = sub === 'accept' ? 'AcceptedForManualIntegration' : sub === 'reject' ? 'Rejected' : sub === 'defer' ? 'Deferred' : option(args, 'decision', true)!; return output(app.decide(args.positionals[2]!, decision(selected), option(args, 'report-hash', true)!, option(args, 'reason') ?? 'Decisão registrada pelo usuário.'));
  }
  if (sub === 'request-changes') { allow(args, ['profile', 'state-dir', 'feedback']); positions(args, 3); const feedback = readFileSync(option(args, 'feedback', true)!, 'utf8'); return output(app.requestChanges(args.positionals[2]!, feedback)); }
  if (sub === 'cleanup') { allow(args, ['profile', 'state-dir', 'confirm']); positions(args, 3); return output(app.cleanup(args.positionals[2]!, flag(args, 'confirm'))); }
  throw new DomainError('UNKNOWN_COMMAND', 'Subcomando candidate desconhecido.');
}
