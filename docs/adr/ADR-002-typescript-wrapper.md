# ADR-002 — Wrapper mínimo em TypeScript

Status: adotado na alpha.1. Data: 2026-09-11.

## Contexto

O wrapper deve ser inspecionável e compatível com a stack do usuário.

## Decisão

Usar TypeScript estrito, módulos ESM e uma interface AgentEngine independente do SDK. JSON Schema valida entradas e checkpoints; YAML serve como configuração/projeção legível.

## Consequências

A alpha usa mock sem IA. Novas abstrações só entram quando um fluxo real as exigir. Dependências são fixadas por package-lock.json.
