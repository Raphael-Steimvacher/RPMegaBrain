# ADR-030 — Checkpoint não depende de SessionEnd

Status: aceita em 11/09/2026.

## Decisão

O wrapper grava checkpoints por transições conhecidas, comandos nomeados, pré-compactação e finalização. Um evento de encerramento de sessão não é requisito de correção.

## Consequências

Interrupção do processo pode perder apenas o trecho posterior ao último checkpoint confirmado; a continuidade não depende de um hook eventual.
