# Estado da implementação

Data: 11/09/2026. Versão: 0.2.0-alpha.1.

O blueprint v0.2 é a referência vigente. Esta entrega implementa o núcleo local e determinístico; não declara integração real com Codex, sandbox do agente ou qualidade de resposta de modelo.

| Marco v0.2 | Estado | Evidência |
|---|---|---|
| 0 — ADRs e schemas | Implementado | ADR-020 a ADR-031, 8 schemas estritos, policies e fixtures |
| 1 — Checkpoints | Implementado | store imutável, encadeamento, hash, `current`, list/inspect/verify e corrupção testada |
| 2 — Continuity Manager | Núcleo implementado | restore capsule, thread opcional, fallback, recovery checkpoint e drift; adapter Codex real pendente |
| 3 — WARM canônica | Implementado | candidatos, revisão humana por hash, Markdown, revisões, lifecycle, locks, exclusão e FTS5 reconstruível |
| 4 — Retrieval WARM | Implementado | filtros, ranking determinístico, orçamento, snapshot, context bundle e explain-context |
| 5 — FULL | Implementado para filesystem/Git local | registry, `rg` com fallback filesystem, provenance, snapshots, doctor, include/exclude e bloqueio de symlink externo |
| 6 — Curadoria | Implementado | skill explicit-only, propostas pendentes, duplicatas, conflitos, expiração, revogação e histórico |
| 7 — Release | Alpha validada | 24 casos catalogados; 56 testes de software passam; baseline de modelo e RC final pendentes |

Os 31 testes v0.1 continuam passando. Os 25 testes v0.2 cobrem checkpoints, continuidade com e sem thread, drift, aprovação, duplicata, conflito, validade, exclusão, FTS5, segredo, FULL com e sem `rg`, symlink, orçamento, shadow, manifest e isolamento físico. O catálogo de 24 casos também inclui cenários que ainda precisam virar avaliações completas de modelo; teste determinístico de software não mede qualidade do Codex.

## Implementado com enforcement local

- Estado, cache e eventos separados fisicamente por perfil.
- Checkpoint como autoridade e thread como otimização.
- Aprovação humana pelo hash exato antes de ativar memória.
- Fontes FULL read-only com raiz absoluta, path containment e provenance.
- Conteúdo recuperado marcado como dado e incapaz de mudar policy no pipeline.
- Manifest v2 com versões de contrato e memória nativa declarada como desativada.
- Bloqueio defensivo de padrões comuns de segredo antes de persistir candidato/checkpoint.

## Trabalho restante para a v0.2 final

- Conectar um adapter real do Codex e aplicar as opções de memória ao processo iniciado pelo wrapper.
- Comprovar sandbox/capabilities contra a versão instalada do Codex.
- Adicionar resolução guiada de conflitos; nesta alpha conflitos ficam em quarentena e exigem nova curadoria/revogação.
- Medir baseline e metas de Precision@5, recall crítico, uso de contexto, latência e tokens com execuções de modelo.
- Validar operacionalmente Linux, backup/restore e durabilidade contra queda de energia.
- Rodar cenários reais sanitizados antes de promover a RC.

Os overlays reais `personal` e `work.colmeia` continuam fora do repositório. Para habilitá-los, copie os templates para a configuração local e informe raízes absolutas autorizadas.
