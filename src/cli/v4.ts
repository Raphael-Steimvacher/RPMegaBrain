import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import type { EvidenceInput } from '../domain/v4/contracts.js';
import { DomainError } from '../domain/policy.js';
import { EvaluationService, type ContractDraft } from '../application/evaluation/service.js';
import { hash, stableJson } from '../infrastructure/hashing.js';
import { validateV4 } from '../infrastructure/v4/validation.js';

type Args = { positionals: string[]; options: Record<string, string> };
function parse(argv: string[]): Args { const positionals: string[] = []; const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) { const item = argv[index]!; if (!item.startsWith('--')) { positionals.push(item); continue; } const key = item.slice(2); const value = argv[++index]; if (!key || !value || value.startsWith('--') || key in options) throw new DomainError('INVALID_ARGUMENTS', `Opção inválida: ${item}`); options[key] = value; }
  return { positionals, options }; }
function option(args: Args, name: string, required = false): string | undefined { const value = args.options[name]; if (required && !value) throw new DomainError('MISSING_ARGUMENT', `Informe --${name}.`); return value; }
function allow(args: Args, names: string[]): void { for (const name of Object.keys(args.options)) if (!names.includes(name)) throw new DomainError('UNEXPECTED_FLAG', `--${name} não se aplica a este comando.`); }
function positions(args: Args, amount: number): void { if (args.positionals.length !== amount) throw new DomainError('INVALID_ARGUMENTS', 'Quantidade incorreta de argumentos.'); }
function structured<T>(path: string): T { const raw = readFileSync(path, 'utf8'); const document = parseDocument(raw, { uniqueKeys: true }); if (document.errors.length) throw new DomainError('INVALID_YAML', 'YAML/JSON inválido.'); return document.toJS({ maxAliasCount: 50 }) as T; }
function output(value: unknown): void { console.log(JSON.stringify(value, null, 2)); }
function service(args: Args): EvaluationService { return new EvaluationService(option(args, 'state-dir'), option(args, 'profile') ?? 'personal'); }
function isV4(argv: string[]): boolean { const command = argv[0]; if (['contract', 'evidence', 'diagnose', 'pattern', 'proposal', 'feedback', 'grader', 'experiment', 'release'].includes(command ?? '')) return true; if (command === 'eval') return ['run', 'show', 'explain', 'rerun', 'compare', 'suite'].includes(argv[1] ?? ''); if (command === 'trace') return argv[1] === 'normalize'; return false; }

function graderCatalog(): Array<Record<string, unknown>> {
  const definitions = [
    { grader_id: 'integrity.bundle', kind: 'integrity', authority_domain: 'integrity', hard_gate: true, deterministic: true, failure_behavior: 'blocked' },
    { grader_id: 'policy.profile_isolation', kind: 'policy', authority_domain: 'security', hard_gate: true, deterministic: true, failure_behavior: 'fail' },
    { grader_id: 'policy.effects', kind: 'policy', authority_domain: 'security', hard_gate: true, deterministic: true, failure_behavior: 'fail' },
    { grader_id: 'verification.validity', kind: 'programmatic', authority_domain: 'verification', hard_gate: true, deterministic: true, failure_behavior: 'blocked' },
    { grader_id: 'requirement.coverage', kind: 'requirement', authority_domain: 'correctness', hard_gate: true, deterministic: true, failure_behavior: 'inconclusive' },
  ];
  return definitions.map(item => { const base = { schema_version: 1, version: '1.0.0', input_schema: 'evidence-bundle@1', output_schema: 'grader-result@1', supported_task_families: ['all'], timeout_ms: 1000, budget: 0, content_hash: '' }; return { ...base, ...item, content_hash: hash(stableJson({ ...base, ...item, content_hash: null })) }; });
}

export async function handleV4(argv: string[]): Promise<boolean> {
  if (!isV4(argv)) return false;
  const args = parse(argv); const command = args.positionals[0]!; const sub = args.positionals[1]; const app = service(args);
  if (command === 'grader') {
    if (sub === 'list') { allow(args, ['profile','state-dir']); positions(args, 2); output(graderCatalog()); }
    else if (sub === 'show') { allow(args, ['profile','state-dir']); positions(args, 3); const grader = graderCatalog().find(item => item.grader_id === args.positionals[2]); if (!grader) throw new DomainError('GRADER_NOT_FOUND', 'Grader não encontrado.'); output(grader); }
    else if (sub === 'validate') { allow(args, ['profile','state-dir']); positions(args, 3); const grader = graderCatalog().find(item => item.grader_id === args.positionals[2]); if (!grader) throw new DomainError('GRADER_NOT_FOUND', 'Grader não encontrado.'); output(validateV4('grader-contract', grader)); }
    else if (sub === 'calibrate') { allow(args, ['profile','state-dir','dataset']); positions(args, 3); output({ grader_id: args.positionals[2], status: 'advisory_only', dataset: option(args, 'dataset') ?? null, model_grader_enabled: false }); }
    else if (sub === 'diff') { allow(args, ['profile','state-dir']); positions(args, 4); output({ version_a: args.positionals[2], version_b: args.positionals[3], equivalent: args.positionals[2] === args.positionals[3] }); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando grader desconhecido.'); return true;
  }
  if (command === 'contract') {
    if (sub === 'create') { allow(args, ['profile','state-dir','file','task','mode']); positions(args, 2); const input = option(args, 'file') ? structured<ContractDraft>(option(args, 'file')!) : { task_id: option(args, 'task', true)!, profile_id: option(args, 'profile', true)!, mode: (option(args, 'mode') ?? 'teach') as 'teach'|'implement', goal: 'Tarefa explicitada pelo usuário', task_family: 'general', requirements: [{ id: 'R1', statement: 'A entrega atende ao objetivo registrado.' }] }; output(app.createContract(input)); }
    else if (sub === 'show' || sub === 'explain') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.showContract(args.positionals[2]!)); }
    else if (sub === 'freeze') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.freezeContract(args.positionals[2]!)); }
    else if (sub === 'revise') { allow(args, ['profile','state-dir','file']); positions(args, 3); output(app.reviseContract(args.positionals[2]!, option(args, 'file') ? structured<Partial<ContractDraft>>(option(args, 'file')!) : {})); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando contract desconhecido.'); return true;
  }
  if (command === 'evidence') {
    if (sub === 'build') { allow(args, ['profile','state-dir','run','contract','file']); positions(args, 2); const contract = option(args, 'contract', true)!; const input = structured<EvidenceInput>(option(args, 'file', true)!); if (input.run_id !== option(args, 'run', true)) throw new DomainError('RUN_ID_MISMATCH', 'Evidence não corresponde ao run.'); output(app.buildEvidence(contract, input)); }
    else if (sub === 'inspect') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.showBundle(args.positionals[2]!)); }
    else if (sub === 'verify') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.verifyBundle(args.positionals[2]!)); }
    else if (sub === 'purge-raw') { allow(args, ['profile','state-dir']); positions(args, 3); output({ run_id: args.positionals[2], purged: false, reason: 'raw trace is never copied into the canonical bundle' }); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando evidence desconhecido.'); return true;
  }
  if (command === 'trace') { if (sub !== 'normalize') throw new DomainError('UNKNOWN_COMMAND', 'Use trace normalize --run RUN --contract CONTRACT --file TRACE.'); allow(args, ['profile','state-dir','run','contract','file']); positions(args, 2); const input = structured<EvidenceInput>(option(args, 'file', true)!); output(app.buildEvidence(option(args, 'contract', true)!, { ...input, run_id: option(args, 'run', true)! })); return true; }
  if (command === 'experiment') {
    if (sub === 'plan') { allow(args, ['profile','state-dir','proposal']); positions(args, 2); const proposal = app.showProposal(option(args, 'proposal', true)!); output({ schema_version: 1, experiment_id: `exp_${proposal.proposal_id}`, suite_id: 'release-v0.4', baseline: { harness_version: '0.3.0', config_hash: 'provided-at-run' }, candidate: null, controls: { model: 'codex', reasoning: 'same', context_snapshot: 'provided-at-run', source_fixture_snapshot: 'provided-at-run', repetitions: 1 }, status: 'planned', proposal_id: proposal.proposal_id }); }
    else if (sub === 'run') { allow(args, ['profile','state-dir']); positions(args, 3); output({ experiment_id: args.positionals[2], status: 'blocked', reason: 'v0.4 aceita somente targets/snapshots já existentes; nenhum target foi fornecido.' }); }
    else if (sub === 'report') { allow(args, ['profile','state-dir']); positions(args, 3); output({ experiment_id: args.positionals[2], status: 'not_found' }); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando experiment desconhecido.'); return true;
  }
  if (command === 'release') {
    if (sub === 'evaluate') { allow(args, ['profile','state-dir','target']); positions(args, 2); output({ target: option(args, 'target') ?? null, status: 'blocked', reason: 'Nenhum candidate automático é criado pela v0.4.', hard_gate: 'not_run' }); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando release desconhecido.'); return true;
  }
  if (command === 'eval') {
    if (sub === 'suite') { allow(args, ['profile','state-dir']); positions(args, 3); if (args.positionals[2] === 'list') output([{ suite_id: 'evaluator-self-test', type: 'self-test' }, { suite_id: 'smoke-v0.4', type: 'smoke' }, { suite_id: 'release-v0.4', type: 'release' }, { suite_id: 'holdout-v0.4', type: 'holdout' }]); else throw new DomainError('UNKNOWN_COMMAND', 'Use eval suite list.'); return true; }
    if (sub === 'run' || sub === 'rerun') { allow(args, ['profile','state-dir','run','contract','evidence']); positions(args, 2); const runId = option(args, 'run', true)!; const bundle = option(args, 'evidence') ? app.showBundle(option(args, 'evidence')!) : app.bundles.list().find(item => item.run_id === runId); if (!bundle) throw new DomainError('V4_RECORD_NOT_FOUND', 'Evidence do run não encontrada.'); const contract = option(args, 'contract') ? app.showContract(option(args, 'contract')!) : app.contracts.list().find(item => item.task_id === bundle.task_id && item.status !== 'superseded'); if (!contract) throw new DomainError('V4_RECORD_NOT_FOUND', 'Contrato da task não encontrado.'); output(app.runEvaluation(contract.contract_id, bundle.bundle_id)); }
    else if (sub === 'show' || sub === 'explain') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.showEvaluation(args.positionals[2]!)); }
    else if (sub === 'compare') { allow(args, ['profile','state-dir']); positions(args, 4); const a = app.showEvaluation(args.positionals[2]!); const b = app.showEvaluation(args.positionals[3]!); output({ baseline: a.status, candidate: b.status, hard_gate_delta: b.hard_gates.failed - a.hard_gates.failed, mandatory_delta: b.requirements.mandatory.passed - a.requirements.mandatory.passed, decision: b.status === 'FAIL' && a.status !== 'FAIL' ? 'reject' : 'review' }); }
    return true;
  }
  if (command === 'diagnose') {
    if (sub === 'run') { allow(args, ['profile','state-dir','evaluation']); positions(args, 2); output(app.diagnose(option(args, 'evaluation', true)!)); }
    else if (sub === 'show' || sub === 'explain') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.diagnoses.get(args.positionals[2]!)); }
    else if (sub === 'request-evidence') { allow(args, ['profile','state-dir']); positions(args, 3); const diagnosis = app.diagnoses.get(args.positionals[2]!); output({ diagnosis_id: diagnosis.diagnosis_id, status: diagnosis.status, request: diagnosis.next_observation }); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando diagnose desconhecido.'); return true;
  }
  if (command === 'pattern') {
    if (sub === 'scan') { allow(args, ['profile','state-dir']); positions(args, 2); output(app.scanPatterns()); }
    else if (sub === 'list') { allow(args, ['profile','state-dir']); positions(args, 2); output(app.listPatterns()); }
    else if (sub === 'show') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.showPattern(args.positionals[2]!)); }
    else if (sub === 'dismiss' || sub === 'invalidate') { allow(args, ['profile','state-dir']); positions(args, 3); const pattern = app.showPattern(args.positionals[2]!); output(app.patterns.replace({ ...pattern, status: sub === 'dismiss' ? 'dismissed' : 'invalidated' }, pattern.pattern_id)); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando pattern desconhecido.'); return true;
  }
  if (command === 'proposal') {
    if (sub === 'create') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.createProposal(args.positionals[2]!)); }
    else if (sub === 'list') { allow(args, ['profile','state-dir']); positions(args, 2); output(app.listProposals()); }
    else if (sub === 'show' || sub === 'explain') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.showProposal(args.positionals[2]!)); }
    else if (sub === 'ready') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.readyProposal(args.positionals[2]!)); }
    else if (sub === 'approve-for-candidate') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.approveProposal(args.positionals[2]!)); }
    else if (sub === 'reject') { allow(args, ['profile','state-dir']); positions(args, 3); output(app.rejectProposal(args.positionals[2]!)); }
    else if (sub === 'request-evidence') { allow(args, ['profile','state-dir']); positions(args, 3); const proposal = app.showProposal(args.positionals[2]!); output({ proposal_id: proposal.proposal_id, status: 'needs_evidence', request: proposal.regression_plan }); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando proposal desconhecido.'); return true;
  }
  if (command === 'feedback') {
    if (sub === 'accept' || sub === 'accept-with-debt' || sub === 'disagree') { allow(args, ['profile','state-dir','reason']); positions(args, 3); const target = args.positionals[2]!; output(app.annotate({ annotator_role: 'user', target_type: 'evaluation', target_id: target, label: sub, critique: option(args, 'reason') ?? '', corrected_value: null, evidence_refs: [], supersedes: null, sensitivity: 'personal', regression_consent: sub !== 'accept-with-debt' })); }
    else if (sub === 'correct' || sub === 'label') { allow(args, ['profile','state-dir','reason','label']); positions(args, 3); output(app.annotate({ annotator_role: 'user', target_type: 'finding', target_id: args.positionals[2]!, label: option(args, 'label', true)!, critique: option(args, 'reason') ?? '', corrected_value: null, evidence_refs: [], supersedes: null, sensitivity: 'personal', regression_consent: true })); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando feedback desconhecido.'); return true;
  }
  return false;
}
