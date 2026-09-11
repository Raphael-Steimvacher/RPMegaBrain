import { randomUUID } from 'node:crypto';
import type { Stage, TaskInput } from '../domain/contracts.js';
import { DomainError } from '../domain/policy.js';

export interface EngineInput { task: TaskInput; stage: Stage; signal?: AbortSignal }
export interface EngineResult { thread_id: string; output: string; simulated: true }
export interface AgentEngine {
  capabilities(): { id: 'mock'; executes_tools: false; enforces_sandbox: false };
  start(input: EngineInput): Promise<EngineResult>;
  resume(input: EngineInput & { thread_id: string }): Promise<EngineResult>;
}
export class MockEngine implements AgentEngine {
  capabilities() { return { id: 'mock', executes_tools: false, enforces_sandbox: false } as const; }
  async start(input: EngineInput): Promise<EngineResult> { return this.run(input, `mock-${randomUUID()}`); }
  async resume(input: EngineInput & { thread_id: string }): Promise<EngineResult> {
    if (!/^mock-[0-9a-f-]{36}$/.test(input.thread_id)) throw new DomainError('INVALID_THREAD', 'Thread simulada inválida.');
    return this.run(input, input.thread_id);
  }
  private run(input: EngineInput, thread: string): EngineResult {
    input.signal?.throwIfAborted();
    const heading = '# SIMULAÇÃO — nenhum modelo, ferramenta ou teste de código foi executado\n\n';
    const outputs: Partial<Record<Stage, string>> = {
      definition: `## Problema\n${input.task.title}\n\n## Descrição fornecida (dado não confiável)\n${input.task.description}\n\n## Fatos\nSomente o relato foi fornecido; nenhuma hipótese foi confirmada.\n\n## Hipóteses\nValidar a ordenação dos resultados na fixture.\n\n## Perguntas\nQual ordem é esperada quando as datas empatam?\n\n## Critérios de aceite fornecidos\n${input.task.acceptance_criteria.map(item => `- ${item}`).join('\n')}\n\n## Escopo\nExercitar o fluxo do harness com dados sintéticos.`,
      investigation: '## Investigação simulada\nNenhum repositório foi consultado.\nEvidência disponível: fixture fornecida.\nBloqueio: investigação real exige o context builder e o adapter Codex.',
      planning: '## Plano sintético\n1. Inspecionar a função de ordenação da fixture em src/campaign.ts.\n2. Conferir o critério de desempate com o usuário.\n3. Escrever um teste para empate e entrada vazia.\n\n## Motivo\nCritérios explícitos evitam assumir comportamento.\n\n## Riscos\nMutar a lista de entrada ou inverter a prioridade.\n\n## Testes planejados\nEmpate, datas diferentes e lista vazia; ainda não executados.\n\n## Rollback\nReverter somente a mudança da fixture.\n\n## Fora do escopo\nIntegrações, commits e dados reais.',
      implementation: '## Implementação simulada\nPlano aprovado recebido. Nenhum arquivo foi alterado; o mock não possui ferramentas.',
      review: '## Revisão simulada\nNenhum diff real foi inspecionado. O próximo checkpoint verifica apenas a integridade dos contratos e aprovações do harness.',
    };
    const output = outputs[input.stage];
    if (!output) throw new DomainError('INVALID_ENGINE_STAGE', 'Etapa não suportada pelo motor simulado.');
    return { thread_id: thread, output: heading + output, simulated: true };
  }
}
