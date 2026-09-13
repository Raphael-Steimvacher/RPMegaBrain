import { EvaluationService } from '../evaluation/service.js';
import { CodexHookJournalStore } from '../../infrastructure/codex-hooks.js';
import type { EvidenceBundle } from '../../domain/v4/contracts.js';
import { DomainError } from '../../domain/policy.js';

export class CodexEvidenceAssembler {
  private readonly journal: CodexHookJournalStore;
  private readonly evaluation: EvaluationService;
  constructor(stateRoot: string | undefined, readonly profileId: string) { this.journal = new CodexHookJournalStore(stateRoot, profileId); this.evaluation = new EvaluationService(stateRoot, profileId); }
  build(contractId: string, sessionRef: string, runId: string): EvidenceBundle {
    const records = this.journal.list(sessionRef); if (!records.length) throw new DomainError('V4_RECORD_NOT_FOUND', 'Sessão de hooks não encontrada.');
    if (records.some(record => record.profile_id !== this.profileId)) throw new DomainError('PROFILE_MISMATCH', 'Sessão pertence a outro profile.');
    const contract = this.evaluation.showContract(contractId); if (contract.status !== 'frozen') throw new DomainError('CONTRACT_NOT_FROZEN', 'Evidence de hooks exige contrato congelado.');
    const ended = records.some(record => record.hook_event === 'SessionEnd');
    return this.evaluation.buildEvidence(contractId, { run_id: runId, task_id: contract.task_id, profile_id: this.profileId,
      events: records.map(record => ({ event_name: `codex.${record.hook_event}`, timestamp: record.observed_at, component: 'codex.hook', status: record.status, reason_code: record.reason_code, sequence_id: record.sequence_id })),
      event_count_expected: ended ? records.length : records.length + 1, raw_trace_available: false,
      artifact_refs: [`codex-hook-session:${sessionRef}`] });
  }
}
