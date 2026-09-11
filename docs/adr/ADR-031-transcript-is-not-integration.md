# ADR-031 — Transcript não é integração

Status: aceita em 11/09/2026.

## Decisão

Transcript, prompt completo e chain-of-thought não são fontes de integração nem estado canônico. O checkpoint guarda fatos, decisões, hipóteses, aprovações e próxima ação em campos mínimos.

## Consequências

O restore capsule é compacto e auditável. Eventos persistem identificadores, hashes, contagens e reason codes, sem conteúdo bruto.
