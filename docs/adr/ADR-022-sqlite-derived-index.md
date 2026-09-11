# ADR-022 — SQLite FTS5 derivado

Status: aceita em 11/09/2026.

## Decisão

SQLite FTS5 serve somente como índice de busca WARM. Markdown permanece a autoridade e reconstrói o banco integralmente.

## Consequências

Perder ou corromper o índice não perde memória. O rebuild é determinístico e a leitura ativa valida o canônico antes da indexação.
