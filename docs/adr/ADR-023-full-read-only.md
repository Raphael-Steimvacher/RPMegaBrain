# ADR-023 — FULL permanece na origem e read-only

Status: aceita em 11/09/2026.

## Decisão

O conhecimento FULL permanece em repositórios, Markdown, runbooks e contextos de perfil. O MegaBrain pesquisa essas fontes por adapters read-only e registra caminho, revisão e hash.

## Consequências

O runtime não cria uma segunda cópia autoritativa. Curadoria pode propor uma conclusão WARM, mas não modifica a fonte FULL.
