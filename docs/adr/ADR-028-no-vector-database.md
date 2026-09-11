# ADR-028 — Sem banco vetorial na v0.2

Status: aceita em 11/09/2026.

## Decisão

A v0.2 combina FTS5 para WARM, `rg` para FULL e ranking determinístico. Não introduz embeddings ou banco vetorial antes de medir misses semânticos reais.

## Consequências

O sistema preserva explicabilidade e baixo custo. Os contratos de itens e proveniência permitem trocar a busca no futuro sem migrar o canônico.
