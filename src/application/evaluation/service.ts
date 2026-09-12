import { randomUUID } from 'node:crypto';
import type { Mode } from '../../domain/contracts.js';
import type { Diagnosis, EvidenceBundle, EvidenceInput, EvaluationResult, Finding, HumanAnnotation, ImprovementProposal, Pattern, TaskContract, TaskRequirement, VerificationEvidence } from '../../domain/v4/contracts.js';
import { DomainError } from '../../domain/policy.js';
import { hash, stableJson } from '../../infrastructure/hashing.js';
import { redact } from '../../infrastructure/privacy.js';
import { validateV4 } from '../../infrastructure/v4/validation.js';
import { V4Store } from '../../adapters/filesystem/v4/store.js';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
const deterministicId = (prefix: string, value: unknown): string => `${prefix}_${hash(stableJson(value)).slice('sha256:'.length, 'sha256:'.length + 32)}`;
const deterministicTimestamp = '1970-01-01T00:00:00.000Z';
const recordHash = (value: unknown, field: string): string => hash(stableJson({ ...(value as Record<string, unknown>), [field]: null }));

export interface ContractDraft {
  task_id: string;
  profile_id: string;
  mode: Mode;
  goal: string;
  task_family: string;
  requirements: Array<Partial<TaskRequirement> & { id: string; statement: string }>;
  non_goals?: string[];
  expected_artifacts?: string[];
  allowed_effects?: string[];
  forbidden_effects?: string[];
  preferred_sources?: string[];
  verification_plan?: string[];
  hard_gates?: string[];
  rubrics?: string[];
  budget?: Partial<TaskContract['budget']>;
  termination?: string;
  ambiguity?: TaskContract['ambiguity'];
  origins?: Record<string, string>;
}

function normalizedRequirement(input: ContractDraft['requirements'][number]): TaskRequirement {
  return { id: input.id, priority: input.priority ?? 'mandatory', statement: redact(input.statement), source_ref: input.source_ref ?? 'user',
    proof: { method: input.proof?.method ?? 'evidence', grader_id: input.proof?.grader_id ?? 'requirement.coverage', ...(input.proof?.expected ? { expected: redact(input.proof.expected) } : {}) },
    dependencies: input.dependencies ?? [], sensitivity: input.sensitivity ?? 'personal' };
}

export class EvaluationService {
  readonly contracts: V4Store<TaskContract>;
  readonly bundles: V4Store<EvidenceBundle>;
  readonly evaluations: V4Store<EvaluationResult>;
  readonly diagnoses: V4Store<Diagnosis>;
  readonly patterns: V4Store<Pattern>;
  readonly proposals: V4Store<ImprovementProposal>;
  readonly annotations: V4Store<HumanAnnotation>;
  private readonly plans: V4Store<Record<string, unknown>>;

  constructor(readonly stateRoot: string | undefined, readonly profileId: string) {
    this.contracts = new V4Store(stateRoot, profileId, 'contracts'); this.bundles = new V4Store(stateRoot, profileId, 'evidence');
    this.evaluations = new V4Store(stateRoot, profileId, 'evaluations'); this.diagnoses = new V4Store(stateRoot, profileId, 'diagnoses');
    this.patterns = new V4Store(stateRoot, profileId, 'patterns'); this.proposals = new V4Store(stateRoot, profileId, 'proposals');
    this.annotations = new V4Store(stateRoot, profileId, 'annotations'); this.plans = new V4Store(stateRoot, profileId, 'plans');
  }

  createContract(input: ContractDraft): TaskContract {
    if (input.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Contrato e store usam profiles diferentes.');
    if (!input.task_id || !input.goal || input.requirements.length === 0) throw new DomainError('CONTRACT_INCOMPLETE', 'Contrato precisa de task, objetivo e requisito.');
    const contract: TaskContract = { schema_version: 1, contract_id: id('contract'), contract_version: 1, task_id: input.task_id, profile_id: input.profile_id, mode: input.mode,
      status: 'draft', goal: redact(input.goal), task_family: input.task_family, requirements: input.requirements.map(normalizedRequirement), non_goals: (input.non_goals ?? []).map(redact),
      expected_artifacts: input.expected_artifacts ?? [], allowed_effects: input.allowed_effects ?? ['read_workspace'], forbidden_effects: input.forbidden_effects ?? ['write_workspace', 'external_write'],
      preferred_sources: input.preferred_sources ?? [], verification_plan: input.verification_plan ?? [], hard_gates: input.hard_gates ?? ['integrity.bundle', 'policy.profile_isolation', 'policy.effects', 'verification.validity', 'requirement.coverage'], rubrics: input.rubrics ?? [],
      budget: { max_tool_calls: input.budget?.max_tool_calls ?? 20, max_input_tokens: input.budget?.max_input_tokens ?? 30000, max_output_tokens: input.budget?.max_output_tokens ?? 12000 },
      termination: input.termination ?? 'resultado e verificações registrados', ambiguity: input.ambiguity ?? 'low', origins: input.origins ?? {}, frozen_at: null, content_hash: hash(''), supersedes: null };
    validateV4('task-contract', contract); return this.contracts.put({ ...contract, content_hash: recordHash(contract, 'content_hash') }, contract.contract_id);
  }

  showContract(contractId: string): TaskContract { return this.contracts.get(contractId); }

  freezeContract(contractId: string): TaskContract {
    const current = this.showContract(contractId);
    if (current.status !== 'draft' && current.status !== 'clarification_required') throw new DomainError('CONTRACT_NOT_EDITABLE', 'Somente contratos em draft podem ser congelados.');
    const frozen: TaskContract = { ...current, status: 'frozen', frozen_at: now() };
    frozen.content_hash = recordHash(frozen, 'content_hash'); validateV4('task-contract', frozen); return this.contracts.replace(frozen, contractId);
  }

  reviseContract(contractId: string, patch: Partial<ContractDraft>): TaskContract {
    const current = this.showContract(contractId); if (current.status !== 'frozen' && current.status !== 'evaluated') throw new DomainError('CONTRACT_NOT_FROZEN', 'Revisão exige contrato congelado.');
    const nextInput: ContractDraft = { task_id: current.task_id, profile_id: current.profile_id, mode: current.mode, goal: current.goal, task_family: current.task_family, requirements: current.requirements,
      non_goals: current.non_goals, expected_artifacts: current.expected_artifacts, allowed_effects: current.allowed_effects, forbidden_effects: current.forbidden_effects,
      preferred_sources: current.preferred_sources, verification_plan: current.verification_plan, hard_gates: current.hard_gates, rubrics: current.rubrics, budget: current.budget,
      termination: current.termination, ambiguity: current.ambiguity, origins: current.origins, ...patch };
    const created = this.createContract(nextInput); const revised = { ...created, contract_version: current.contract_version + 1, supersedes: current.contract_id, content_hash: '' };
    revised.content_hash = recordHash(revised, 'content_hash');
    // Frozen records are authoritative history. A revision points to its predecessor;
    // it must never rewrite the predecessor's content or hash.
    return this.contracts.replace(revised, revised.contract_id);
  }

  buildEvidence(contractId: string, input: EvidenceInput): EvidenceBundle {
    const contract = this.showContract(contractId);
    if (contract.profile_id !== this.profileId || input.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Evidence e contrato não pertencem ao profile ativo.');
    if (contract.task_id !== input.task_id) throw new DomainError('TASK_ID_MISMATCH', 'Evidence não pertence à task do contrato.');
    const rawEvents = input.events ?? []; const unknownFields: string[] = []; const malformedEvents = rawEvents.some((event, index) => {
      if (typeof event.event_name !== 'string' && typeof event.event !== 'string') { unknownFields.push(`event[${index}].event_name`); return true; }
      if (typeof event.timestamp !== 'string' || Number.isNaN(Date.parse(event.timestamp))) { unknownFields.push(`event[${index}].timestamp`); return true; }
      return false;
    });
    const events = rawEvents.map((event, index) => this.normalizeEvent(event, index));
    const expected = input.event_count_expected ?? null; const gaps: number[] = [];
    for (let index = 0; index < events.length; index += 1) if (events[index]!.sequence_id !== index + 1) gaps.push(index + 1);
    if (expected !== null && expected !== events.length) gaps.push(expected);
    const verification: VerificationEvidence[] = (input.verification ?? []).map(item => ({ verification_id: item.verification_id, kind: item.kind, status: item.status,
      command_hash: item.command_hash ?? null, exit_code: item.exit_code ?? null, artifact_refs: item.artifact_refs ?? [], requirement_ids: item.requirement_ids ?? [],
      started_at: item.started_at ?? null, completed_at: item.completed_at ?? null, valid_for: item.valid_for ?? item.requirement_ids ?? [] }));
    const bundle: EvidenceBundle = { schema_version: 1, bundle_id: '', run_id: input.run_id, task_id: input.task_id, profile_id: input.profile_id,
      contract: { id: contract.contract_id, version: contract.contract_version, hash: contract.content_hash }, manifest: { harness_version: input.harness_version ?? '0.4.0', harness_commit: input.harness_commit ?? null, config_hash: input.config_hash ?? hash('default-config'), source_schema_version: 4 },
      outcome: { result_ref: input.result_ref ?? null, artifact_refs: input.artifact_refs ?? [], output_hash: input.output ? hash(redact(input.output)) : null, output_redacted: input.output !== undefined && input.output !== null }, verification,
      execution: { events, tool_calls: events.filter(event => event.event_name.toLowerCase().includes('tool')).length, retries: events.reduce((sum, event) => sum + (event.event_name.toLowerCase().includes('retry') ? 1 : 0), 0), duration_ms: null },
      context: { selected_refs: input.context?.selected_refs ?? [], rejected_refs: input.context?.rejected_refs ?? [], used_refs: input.context?.used_refs ?? [] },
      policy: { decisions: (input.policy?.decisions ?? []).map(item => ({ decision_id: item.decision_id, decision: item.decision, reason_code: item.reason_code ?? null, hard_failure: item.hard_failure ?? false })), forbidden_effects_observed: input.policy?.forbidden_effects_observed ?? [], profile_matches: input.policy?.profile_matches ?? true },
      feedback: { annotation_refs: [] }, integrity: { status: malformedEvents ? 'blocked' : gaps.length ? 'partial' : 'complete', event_count_expected: expected, event_count_observed: events.length, gaps, redacted_fields: input.output ? this.redactionCount(input.output) : 0, unknown_fields: unknownFields, raw_trace_available: input.raw_trace_available ?? false }, bundle_hash: hash('') };
    bundle.bundle_id = deterministicId('evidence', { ...bundle, bundle_id: null, bundle_hash: null });
    bundle.bundle_hash = recordHash(bundle, 'bundle_hash'); validateV4('evidence-bundle', bundle); return this.bundles.put(bundle, bundle.bundle_id);
  }

  showBundle(bundleId: string): EvidenceBundle { return this.bundles.get(bundleId); }
  verifyBundle(bundleId: string): { bundle_id: string; valid: boolean; status: EvidenceBundle['integrity']['status']; reason: string | null } {
    const bundle = this.showBundle(bundleId); const valid = recordHash(bundle, 'bundle_hash') === bundle.bundle_hash;
    return { bundle_id: bundle.bundle_id, valid, status: bundle.integrity.status, reason: valid ? null : 'HASH_MISMATCH' };
  }

  runEvaluation(contractId: string, bundleId: string): EvaluationResult {
    const contract = this.showContract(contractId); const bundle = this.showBundle(bundleId);
    if (contract.status !== 'frozen' && contract.status !== 'evaluated') throw new DomainError('CONTRACT_NOT_FROZEN', 'Evaluation exige Task Contract congelado.');
    if (bundle.profile_id !== this.profileId || contract.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Avaliação cross-profile bloqueada.');
    const bundleCheck = this.verifyBundle(bundleId);
    const evaluationKey = hash(stableJson({ contract: contract.content_hash, bundle: bundle.bundle_hash, graders: contract.hard_gates, evaluator: 'v0.4.1' }));
    const evaluationId = deterministicId('eval', evaluationKey);
    if (this.evaluations.has(evaluationId)) return this.evaluations.get(evaluationId);
    const plan = { schema_version: 1, evaluation_id: evaluationId, evaluation_key: evaluationKey, contract_hash: contract.content_hash, bundle_hash: bundle.bundle_hash,
      graders: contract.hard_gates, model_grader: { enabled: false, budget: 0, timeout_ms: 0 }, created_at: contract.frozen_at ?? deterministicTimestamp };
    // The immutable plan is the authority for the grader set and is persisted
    // before any grader can emit a finding.
    this.plans.put(plan, evaluationId);
    const findings: Finding[] = [];
    const configured = new Set(contract.hard_gates);
    const gate = (name: string): boolean => configured.has(name);
    const unknownGates = contract.hard_gates.filter(name => !['integrity.bundle', 'policy.profile_isolation', 'policy.effects', 'policy.decision', 'verification.validity', 'requirement.coverage'].includes(name));
    for (const unknown of unknownGates) findings.push(this.finding(null, 'integrity', 'BLOCKED', 'EVAL.UNKNOWN_GRADER', 'critical', true, `Hard gate não reconhecido: ${unknown}.`, [], ['grader catalog'], unknown));
    const integrityBlocked = bundle.contract.id !== contract.contract_id || bundle.contract.version !== contract.contract_version || bundle.contract.hash !== contract.content_hash || !bundleCheck.valid || bundle.integrity.status === 'blocked';
    if (gate('integrity.bundle')) {
      if (bundle.contract.id !== contract.contract_id || bundle.contract.version !== contract.contract_version || bundle.contract.hash !== contract.content_hash) findings.push(this.finding(null, 'integrity', 'BLOCKED', 'EVAL.EVIDENCE_INSUFFICIENT', 'critical', true, 'Bundle não referencia exatamente o contrato congelado.', [], ['contract hash'], 'integrity.contract'));
      else if (!bundleCheck.valid) findings.push(this.finding(null, 'integrity', 'BLOCKED', 'EVAL.EVIDENCE_INSUFFICIENT', 'critical', true, 'Evidence Bundle possui hash inválido.', [], ['bundle_hash'], 'integrity.bundle'));
      else if (bundle.integrity.status === 'blocked') findings.push(this.finding(null, 'integrity', 'BLOCKED', 'EVAL.EVIDENCE_INSUFFICIENT', 'high', true, 'Bundle bloqueado por integridade ou schema.', [], ['integrity'], 'integrity.bundle'));
      else if (bundle.integrity.status === 'partial') findings.push(this.finding(null, 'integrity', 'INCONCLUSIVE', 'EVAL.EVIDENCE_INSUFFICIENT', 'medium', true, 'Bundle possui gaps de evidência.', [], ['trace gaps'], 'integrity.bundle'));
      else findings.push(this.finding(null, 'integrity', 'PASS', null, 'info', true, 'Integridade do bundle conferida.', ['bundle_hash'], [], 'integrity.bundle'));
    }
    // A blocked integrity gate is terminal. Do not manufacture downstream PASS findings.
    if (!integrityBlocked) {
      if (gate('policy.profile_isolation')) {
        if (!bundle.policy.profile_matches) findings.push(this.finding(null, 'security', 'FAIL', 'ROUTE.PROFILE_MISMATCH', 'critical', true, 'Evidence pertence a profile diferente do contrato.', [], ['profile equality'], 'policy.profile_isolation'));
        else findings.push(this.finding(null, 'security', 'PASS', null, 'info', true, 'Profile do bundle coincide com o contrato.', ['profile equality'], [], 'policy.profile_isolation'));
      }
      if (gate('policy.effects')) {
        if (bundle.policy.forbidden_effects_observed.length) findings.push(this.finding(null, 'security', 'FAIL', 'POLICY.VIOLATION', 'critical', true, 'Efeito proibido foi observado.', [], ['forbidden effects'], 'policy.effects'));
        else findings.push(this.finding(null, 'security', 'PASS', null, 'info', true, 'Nenhum efeito proibido foi observado.', ['policy effects'], [], 'policy.effects'));
      }
      if (gate('policy.decision')) for (const decision of bundle.policy.decisions) if (decision.decision === 'DENY' || decision.decision === 'QUARANTINE') findings.push(this.finding(null, 'security', 'FAIL', 'POLICY.VIOLATION', 'critical', true, `Policy decision ${decision.decision} bloqueou a execução.`, [`policy:${decision.decision_id}`], [], 'policy.decision'));
      if (gate('verification.validity')) for (const check of bundle.verification) {
        if (check.status === 'failed') findings.push(this.finding(null, 'verification', 'FAIL', 'VERIFY.INVALID', 'high', true, `Verificação ${check.verification_id} falhou.`, [`verification:${check.verification_id}`], [], 'verification.validity'));
        else if (check.status === 'passed' && !this.verificationIsProven(check, bundle)) findings.push(this.finding(null, 'verification', 'INCONCLUSIVE', 'VERIFY.INVALID', 'high', true, `Verificação ${check.verification_id} não possui prova estrutural suficiente.`, [`verification:${check.verification_id}`], ['result/artifact, timestamps and method-compatible evidence'], 'verification.validity'));
      }
    }
    const requirementCounts = { mandatory: { passed: 0, failed: 0, inconclusive: 0 }, desirable: { passed: 0, failed: 0, inconclusive: 0 } };
    if (!integrityBlocked && gate('requirement.coverage')) for (const requirement of contract.requirements.filter(item => item.priority !== 'post_hoc')) {
      const related = bundle.verification.filter(check => check.requirement_ids.includes(requirement.id) || check.valid_for.includes(requirement.id));
      const failed = related.find(check => check.status === 'failed'); const passed = related.find(check => check.status === 'passed' && this.verificationMatchesRequirement(check, requirement, bundle));
      const status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' = failed ? 'FAIL' : passed ? 'PASS' : 'INCONCLUSIVE';
      const bucket = requirement.priority === 'mandatory' ? requirementCounts.mandatory : requirementCounts.desirable;
      bucket[status === 'PASS' ? 'passed' : status === 'FAIL' ? 'failed' : 'inconclusive'] += 1;
      findings.push(this.finding(requirement.id, 'requirement', status, status === 'FAIL' ? 'EXEC.PARTIAL_RESULT' : status === 'INCONCLUSIVE' ? 'EVAL.EVIDENCE_INSUFFICIENT' : null,
        requirement.priority === 'mandatory' ? 'high' : 'medium', requirement.priority === 'mandatory' && gate('requirement.coverage'), status === 'PASS' ? `Requisito ${requirement.id} possui verificação.` : status === 'FAIL' ? `Requisito ${requirement.id} falhou.` : `Não há prova suficiente para ${requirement.id}.`,
        related.map(item => `verification:${item.verification_id}`), status === 'INCONCLUSIVE' ? [`verification for ${requirement.id}`] : [], requirement.proof.grader_id));
    }
    const hardFailed = findings.filter(item => item.hard_gate && item.status === 'FAIL').length; const hardBlocked = findings.filter(item => item.hard_gate && item.status === 'BLOCKED').length;
    const hardInconclusive = findings.some(item => item.hard_gate && item.status === 'INCONCLUSIVE');
    const status = hardBlocked ? 'BLOCKED' : hardFailed ? 'FAIL' : hardInconclusive ? 'INCONCLUSIVE' : 'PASS';
    const result: EvaluationResult = { schema_version: 1, evaluation_id: evaluationId, run_id: bundle.run_id, task_id: bundle.task_id, profile_id: bundle.profile_id,
      contract_ref: { id: contract.contract_id, version: contract.contract_version }, evidence_bundle_ref: { id: bundle.bundle_id, hash: bundle.bundle_hash }, status,
      hard_gates: { passed: findings.filter(item => item.hard_gate && item.status === 'PASS').length, failed: hardFailed, blocked: hardBlocked }, requirements: requirementCounts,
      findings, soft_scores: {}, grader_runs: contract.hard_gates, model_grader: { enabled: false, reason: 'disabled_by_default' }, created_at: contract.frozen_at ?? deterministicTimestamp, result_hash: hash('') };
    result.result_hash = recordHash(result, 'result_hash'); validateV4('evaluation-result', result);
    return this.evaluations.put(result, evaluationId);
  }

  showEvaluation(evaluationId: string): EvaluationResult { return this.evaluations.get(evaluationId); }
  verifyEvaluation(evaluationId: string): boolean { const result = this.showEvaluation(evaluationId); return recordHash(result, 'result_hash') === result.result_hash; }

  diagnose(evaluationId: string): Diagnosis {
    const evaluation = this.showEvaluation(evaluationId); const bundle = this.showBundle(evaluation.evidence_bundle_ref.id); const target = evaluation.findings.find(item => item.status === 'FAIL' || item.status === 'INCONCLUSIVE');
    if (!target) throw new DomainError('NO_DIAGNOSIS_TARGET', 'Evaluation não possui finding falho ou inconclusivo.');
    const event = bundle.execution.events.find(item => item.status === 'failure' || item.status === 'blocked'); const component = event?.component ?? null;
    const missing = target.missing_evidence.length ? target.missing_evidence : ['counterfactual run'];
    const diagnosis: Diagnosis = { schema_version: 1, diagnosis_id: id('diag'), evaluation_id: evaluationId, finding_ids: [target.finding_id], status: 'inconclusive', failure_code: target.failure_code ?? 'UNKNOWN.UNCLASSIFIED',
      symptom: target.statement, localization: { first_observed_divergence: event?.event_name ?? null, component }, hypotheses: [{ hypothesis_id: id('hyp'), statement: component ? `O componente ${component} pode ter contribuído para o finding.` : 'A causa não pode ser localizada com a evidência disponível.', target_component: component ?? 'unknown', mechanism: 'correlação observacional; não confirmada', evidence_for: target.evidence_refs, evidence_against: ['nenhum contrafactual foi executado'], expected_counterfactual: 'repetir com o componente isolado ou evidência equivalente', confidence: component ? 'low' : 'unknown', status: 'hypothesis' }], alternatives: ['MODEL.INSTRUCTION_MISS', 'ENV.NONDETERMINISM'], missing_evidence: missing, next_observation: 'coletar contrafactual e verificar a primeira divergência no trace', fingerprint: hash(stableJson({ failure_code: target.failure_code, component, task_family: target.dimension })), created_at: now() };
    validateV4('diagnosis', diagnosis); return this.diagnoses.put(diagnosis, diagnosis.diagnosis_id);
  }

  scanPatterns(): Pattern[] {
    const diagnoses = this.diagnoses.list(); const evaluations = new Map(this.evaluations.list().map(item => [item.evaluation_id, item])); const contracts = new Map(this.contracts.list().map(item => [item.contract_id, item])); const groups = new Map<string, { cases: Set<string>; first: string; last: string; diagnosis: Diagnosis; taskFamily: string }>();
    for (const diagnosis of diagnoses) { const evaluation = evaluations.get(diagnosis.evaluation_id); if (!evaluation) continue; const component = diagnosis.localization.component ?? 'unknown'; const taskFamily = contracts.get(evaluation.contract_ref.id)?.task_family ?? 'unknown'; const key = `${evaluation.profile_id}|${diagnosis.failure_code}|${component}|${taskFamily}`; const existing = groups.get(key); if (existing) { existing.cases.add(evaluation.task_id); existing.last = diagnosis.created_at; } else groups.set(key, { cases: new Set([evaluation.task_id]), first: diagnosis.created_at, last: diagnosis.created_at, diagnosis, taskFamily }); }
    const result: Pattern[] = [];
    for (const [key, group] of groups) { const [profile, failure, component, taskFamily] = key.split('|'); const current = this.patterns.list().find(item => item.fingerprint === hash(key)); const count = group.cases.size; const urgent = group.diagnosis.failure_code.startsWith('POLICY.') || group.diagnosis.hypotheses.some(item => item.confidence === 'high');
      const lifecycleStatus = current?.status === 'proposal_linked' || current?.status === 'dismissed' || current?.status === 'invalidated' ? current.status : count >= 3 || urgent ? 'confirmed' : 'candidate';
      const pattern: Pattern = { schema_version: 1, pattern_id: current?.pattern_id ?? deterministicId('pattern', key), status: lifecycleStatus, profile_scope: [profile ?? this.profileId], failure_code: failure ?? 'UNKNOWN.UNCLASSIFIED', component: component ?? 'unknown', stage: 'diagnosis', task_family: taskFamily ?? group.taskFamily, independent_case_count: count, case_refs: [...group.cases], confidence: count >= 3 ? 'medium' : 'low', first_seen: group.first, last_seen: group.last, fingerprint: hash(key), urgent, proposal_ref: current?.proposal_ref ?? null };
      validateV4('pattern', pattern); if (current) this.patterns.replace(pattern, pattern.pattern_id); else this.patterns.put(pattern, pattern.pattern_id); result.push(pattern); }
    return result;
  }

  listPatterns(): Pattern[] { return this.patterns.list(); }
  showPattern(patternId: string): Pattern { return this.patterns.get(patternId); }
  createProposal(patternId: string): ImprovementProposal {
    const pattern = this.showPattern(patternId); if (pattern.proposal_ref) return this.showProposal(pattern.proposal_ref); if (pattern.status !== 'confirmed') throw new DomainError('PATTERN_NOT_CONFIRMED', 'Proposal exige pattern confirmado ou urgente.');
    const diagnoses = this.diagnoses.list().filter(item => item.failure_code === pattern.failure_code && (item.localization.component ?? 'unknown') === pattern.component);
    const proposal: ImprovementProposal = { schema_version: 1, proposal_id: id('proposal'), status: 'draft', profile_scope: pattern.profile_scope, source: { pattern_id: pattern.pattern_id, diagnosis_ids: diagnoses.map(item => item.diagnosis_id) }, target: { type: 'evaluator_or_component', component_id: pattern.component },
      problem: { statement: `Falha recorrente ${pattern.failure_code} observada em ${pattern.independent_case_count} caso(s).`, failure_code: pattern.failure_code, observed_impact: 'requisito falho ou evidência insuficiente' }, change: { intended_behavior: 'reduzir a recorrência preservando os hard gates', non_goals: ['alterar policy permissiva automaticamente', 'editar o harness nesta versão'] },
      evidence: { supporting: diagnoses.flatMap(item => item.hypotheses.flatMap(hypothesis => hypothesis.evidence_for)), refuting: diagnoses.flatMap(item => item.hypotheses.flatMap(hypothesis => hypothesis.evidence_against)) }, confidence: pattern.confidence, affected_versions: ['0.4.0'], regression_plan: { cases: pattern.case_refs, hard_gates: ['profile isolation', 'redaction', 'deterministic reproducibility'] }, risk: { security: 'review_required', privacy: 'profile-scoped', memory: 'no automatic promotion' }, rollback: { strategy: 'restaurar o hash anterior do componente' }, human_decision: null, created_at: now() };
    validateV4('improvement-proposal', proposal); this.proposals.put(proposal, proposal.proposal_id); this.patterns.replace({ ...pattern, status: 'proposal_linked', proposal_ref: proposal.proposal_id }, pattern.pattern_id); return proposal;
  }
  listProposals(): ImprovementProposal[] { return this.proposals.list(); }
  showProposal(proposalId: string): ImprovementProposal { return this.proposals.get(proposalId); }
  readyProposal(proposalId: string): ImprovementProposal { const proposal = this.showProposal(proposalId); if (proposal.status !== 'draft' && proposal.status !== 'needs_evidence') throw new DomainError('PROPOSAL_NOT_DRAFT', 'Proposal não está em draft.'); return this.proposals.replace({ ...proposal, status: 'ready_for_review' }, proposalId); }
  approveProposal(proposalId: string): ImprovementProposal { const proposal = this.showProposal(proposalId); if (proposal.status !== 'ready_for_review') throw new DomainError('PROPOSAL_NOT_READY', 'Proposal não está pronta para revisão.'); const next = { ...proposal, status: 'approved_for_candidate' as const, human_decision: 'approved_for_candidate' }; return this.proposals.replace(next, proposalId); }
  rejectProposal(proposalId: string): ImprovementProposal { const proposal = this.showProposal(proposalId); return this.proposals.replace({ ...proposal, status: 'rejected', human_decision: 'rejected' }, proposalId); }
  annotate(input: Omit<HumanAnnotation, 'schema_version' | 'annotation_id' | 'created_at' | 'profile_id'>): HumanAnnotation { const value: HumanAnnotation = { schema_version: 1, annotation_id: id('annotation'), created_at: now(), profile_id: this.profileId, ...input, critique: redact(input.critique) }; return this.annotations.put(value, value.annotation_id); }

  private verificationMatchesRequirement(check: VerificationEvidence, requirement: TaskRequirement, bundle: EvidenceBundle): boolean {
    if (!this.verificationIsProven(check, bundle)) return false;
    const method = requirement.proof.method.toLowerCase();
    const expectedKind: Record<string, VerificationEvidence['kind'] | undefined> = { command: 'command', test: 'test', lint: 'lint', schema: 'schema', property: 'property', human: 'human', artifact: 'artifact', rubric: 'human' };
    return expectedKind[method] === undefined || expectedKind[method] === check.kind || method === 'evidence';
  }

  private verificationIsProven(check: VerificationEvidence, bundle: EvidenceBundle): boolean {
    if (check.status !== 'passed') return false;
    if (check.kind === 'command' && check.exit_code !== 0) return false;
    if (!check.started_at || !check.completed_at || Number.isNaN(Date.parse(check.started_at)) || Number.isNaN(Date.parse(check.completed_at)) || Date.parse(check.completed_at) < Date.parse(check.started_at)) return false;
    const hasResult = Boolean(bundle.outcome.result_ref || bundle.outcome.output_hash || bundle.outcome.artifact_refs.length || check.artifact_refs.length);
    return hasResult;
  }

  private finding(requirementId: string | null, dimension: string, status: Finding['status'], failureCode: string | null, severity: Finding['severity'], hardGate: boolean, statement: string, evidenceRefs: string[], missing: string[], graderId: string): Finding { return { finding_id: deterministicId('finding', { requirementId, dimension, status, failureCode, statement, evidenceRefs, missing, graderId }), requirement_id: requirementId, dimension, status, failure_code: failureCode, severity, hard_gate: hardGate, statement, evidence_refs: evidenceRefs, missing_evidence: missing, grader_id: graderId }; }
  private normalizeEvent(event: Record<string, unknown>, index: number): EvidenceBundle['execution']['events'][number] {
    const eventName = typeof event.event_name === 'string' ? event.event_name : typeof event.event === 'string' ? event.event : 'unknown.event'; const rawStatus = event.outcome ?? event.status; const status: EvidenceBundle['execution']['events'][number]['status'] = rawStatus === 'success' ? 'success' : rawStatus === 'failure' ? 'failure' : rawStatus === 'blocked' ? 'blocked' : 'unknown';
    const rawContent = Object.entries(event).filter(([key]) => /prompt|transcript|scratchpad|reasoning|secret|token|body|content/i.test(key)).map(([, value]) => String(value)).join('|');
    const sequence = typeof event.sequence_id === 'number' ? event.sequence_id : typeof event.sequence === 'number' ? event.sequence : index + 1;
    const timestamp = typeof event.timestamp === 'string' && !Number.isNaN(Date.parse(event.timestamp)) ? event.timestamp : deterministicTimestamp;
    const normalized = { sequence_id: sequence, event_name: eventName, timestamp, component: typeof event.component === 'string' ? event.component : typeof event.producer === 'string' ? event.producer : 'unknown', status, reason_code: typeof event.reason_code === 'string' ? event.reason_code : null, trace_id: typeof event.trace_id === 'string' ? event.trace_id : null, span_id: typeof event.span_id === 'string' ? event.span_id : null, input_shape: typeof event.input_shape === 'string' ? event.input_shape : null, output_shape: typeof event.output_shape === 'string' ? event.output_shape : null, content_hash: rawContent ? hash(redact(rawContent)) : null, content_present: Boolean(rawContent), latency_ms: typeof event.duration_ms === 'number' ? event.duration_ms : null };
    return { event_id: typeof event.event_id === 'string' ? event.event_id : deterministicId('event', normalized), ...normalized };
  }
  private redactionCount(value: string): number { return value === redact(value) ? 0 : 1; }
}
