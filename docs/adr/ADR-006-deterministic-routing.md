# ADR-006 — Routing determinístico

Status: adotado na alpha.1. Data: 2026-09-11.

## Contexto

Perfil e fontes determinam quais dados ficam disponíveis ao agente.

## Decisão

Seleção explícita de perfil e validação de allowlists no wrapper. Texto recuperado não pode escolher permissões, modo ou perfil.

## Consequências

Sem router LLM. A alpha exige synthetic e ainda não lê fontes; casos adversariais do motor real continuam necessários.
