# ADR-005 — Observabilidade desde o início

Status: adotado na alpha.1. Data: 2026-09-11.

## Contexto

Sem registro comparável não é possível atribuir falhas ou avaliar mudanças do harness.

## Decisão

Todo run tem manifest e eventos normalizados JSONL antes da integração de IA. Separar trace, verificação, avaliação e proposta.

## Consequências

Eventos pontuais têm duração zero nesta alpha. OTel e métricas reais entram mais tarde. Não serializar prompts, saídas de ferramentas ou raciocínio interno.
