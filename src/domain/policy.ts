import type { Approval, Mode, Profile, State } from './contracts.js';
import { hash } from '../infrastructure/hashing.js';

export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export function resolveMode(mode?: string, podeFazer = false): Mode {
  if (mode !== undefined && mode !== 'teach' && mode !== 'implement') {
    throw new DomainError('INVALID_MODE', 'Modo inválido. Use teach ou implement.');
  }
  if (podeFazer && mode === 'teach') throw new DomainError('CONFLICTING_FLAGS', '--pode-fazer conflita com --mode teach.');
  return podeFazer ? 'implement' : mode ?? 'teach';
}
export function requireApproval(approval: Approval, content: string): void {
  if (!content || approval.status !== 'approved' || approval.approved_by !== 'user' ||
      !approval.approved_at || approval.artifact_hash !== hash(content)) {
    throw new DomainError('APPROVAL_REQUIRED', 'Aprovação humana ausente ou artefato alterado. Aprove o conteúdo atual.');
  }
}
export function gateImplementation(mode: Mode, approval: Approval, plan: string): void {
  if (mode === 'implement') requireApproval(approval, plan);
}
export function requireSource(profile: Profile, sourceId: string): void {
  if (!profile.source_allowlist.includes(sourceId)) throw new DomainError('SOURCE_DENIED', 'Fonte não autorizada pelo perfil ativo.');
}
const transitions: Record<State, readonly State[]> = {
  created: ['defined'], defined: ['investigating'], investigating: ['plan_ready'],
  plan_ready: ['awaiting_user_code', 'implementing'], awaiting_user_code: ['reviewing'],
  implementing: ['reviewing'], reviewing: ['verified', 'needs_changes'],
  needs_changes: ['investigating'], verified: ['evaluated'], evaluated: [],
};
export function transition(from: State, to: State): State {
  if (!transitions[from].includes(to)) throw new DomainError('INVALID_TRANSITION', `Transição inválida: ${from} → ${to}.`);
  return to;
}
