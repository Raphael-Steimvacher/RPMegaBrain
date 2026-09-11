# Estado da implementação

Data: 11/09/2026. Versão: 0.1.0-alpha.1.

## Leitura e interpretação

Foram lidos o rascunho v0.0 e o blueprint técnico v0.1 do repositório. A conversa compartilhada não carregou no ChatGPT. O blueprint mais recente orientou a implementação; nenhum dado ou decisão adicional foi presumido a partir da conversa inacessível.

## Entrega atual

| Marco | Estado | Evidência |
|---|---|---|
| 0 — contratos | Base implementada | 8 ADRs, 9 schemas, invariantes, taxonomia, fixtures e casos iniciais catalogados |
| 1 — CLI/run store | Caminho principal implementado com mock | wac/status/approve/resume/review/eval/trace, checkpoints, manifest, erros e cancelamento |
| 2 — perfil/policy | Apenas fundamentos | teach por padrão, gate por hash e função de allowlist testados; loaders reais pendentes |
| 3 — contexto/skills | Pendente | Nenhuma recuperação de fontes ou skill carregada nesta alpha |
| 4 — Codex | Pendente | Interface AgentEngine e mock; SDK ausente |
| 5 — verificação real | Pendente | Só integridade dos contratos/aprovação; não inspeciona diff ou testes reais |
| 6 — OTel | Pendente | JSONL local existente; collector, redactor OTel, Aspire e retenção pendentes |
| 7 — baseline/release | Pendente | Testes de software existentes; ainda sem baseline de qualidade do modelo |

O catálogo de 15 casos descreve os cenários de avaliação da v0.1. Ele não representa 15 evals de modelo executados. A suite em `tests/` mede os contratos e o ciclo de software e não mede qualidade de resposta do Codex.

## Plano de arquivos do Marco 0

1. `docs/adr/`: registrar as sete decisões do blueprint e a escolha operacional Node/Windows.
2. `schemas/`: contratos de perfil, fontes, entrada WAC, manifest, estado, trace, avaliação, checkpoint e proposta.
3. `docs/architecture/events.md`: distinguir eventos implementados dos reservados para o runtime real.
4. `docs/security/invariants.md`: ligar cada garantia à implementação ou ao marco pendente.
5. `evals/fixtures/` e `evals/cases/`: somente conteúdo sintético.
6. `src/domain/`: tipos e regras puras sem depender do SDK.
7. `src/infrastructure/`: hashes, validação, redação e store; só então `src/application/` e CLI.

## Limites deliberados

- Nenhum runtime real, shell de agente, integração ou acesso a arquivos-alvo.
- Isolamento de leitura por allowlist/sandbox ainda precisa de enforcement real; o teste puro de allowlist não prova isolamento do Codex.
- O mock tem texto fixo e não é um planejador útil para uma WAC real.
- O estado `needs_changes` está no contrato, mas o caminho de replanejamento ainda não foi exposto na CLI.
- Sem edição de artefatos pela CLI, retenção, promoção WARM, analyzer ou propostas automáticas.
- Sem retentativa automática; falhas/cancelamentos mantêm o checkpoint anterior e aceitam retomada explícita.
- JSON Schemas da alpha restringem o adapter a mock. Adicionar Codex exige revisar os contratos e a compatibilidade dos checkpoints.
- `storage_revision` cresce a cada gravação; `run_revision` cresce ao retomar execução/recompor modo, mantendo o mesmo run/task ID.
- Os checkpoints são locais e não assinados. ACLs do Windows são herdadas; modos POSIX são solicitados em sistemas compatíveis.

## Próximo incremento concreto

Marco 2: resolver um único perfil, ler overlay configurado fora do núcleo, validar raízes reais e symlinks, aplicar allowlist antes de acessar fontes e exibir capabilities. Bloquear escrita real até existir um adapter com sandbox comprovado. Para ativar `work.colmeia`, serão necessários os caminhos do overlay e do repositório-alvo autorizado; eles não são necessários para esta entrega sintética.
