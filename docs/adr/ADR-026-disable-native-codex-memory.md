# ADR-026 — Memória nativa do Codex desativada

Status: aceita em 11/09/2026.

## Decisão

Runs gerenciados configuram geração e uso da memória local nativa do Codex como falsos e registram a política no manifest v2.

## Consequências

O MegaBrain mantém uma única autoridade de memória auditável por perfil. O usuário pode usar memória nativa fora do wrapper sem torná-la fonte do harness.
