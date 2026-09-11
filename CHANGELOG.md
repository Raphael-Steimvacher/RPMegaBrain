# Changelog

## 0.3.0-alpha.1 — 2026-09-11

- Connector Registry por perfil, lifecycle, identidade/tenant/scopes e secret refs opacos.
- Capability Catalog e Tool Catalog hashado com default deny e quarentena por drift.
- Policy Gateway com resource/workflow/purpose/sensitivity/consent/pagination/egress e decisões explicáveis.
- Consent receipts, external refs reference-only, Output Guard e manifest v3 metadata-only.
- Fake provider determinístico para os ports externos, falhas normalizadas e ausência de fallback.
- Draft local/externo com opt-in, aprovação por hash e idempotência; send e anexos permanecem estruturalmente ausentes.
- 10 schemas, policies, catálogos, ADR-032 a ADR-047, threat model, runbooks e catálogo dos 37 casos v0.3.
- Compatibilidade preservada: 31 testes v0.1, 26 v0.2/continuidade e 15 v0.3 passam.

Esta alpha não autentica providers reais, não aplica configuração MCP/Codex e não prova scopes ou sandbox externos.

## 0.2.0-alpha.1 — 2026-09-11

- Checkpoints v0.2 imutáveis e verificáveis, restore capsule, fallback de thread e detecção de drift.
- Memória WARM canônica em Markdown, revisões, aprovação humana por hash, duplicatas, quarentena, validade, revogação e exclusão material.
- Índice derivado SQLite FTS5 com rebuild determinístico.
- Registry e busca FULL read-only com `rg` ou fallback filesystem, include/exclude, provenance, snapshots e proteção de caminho/symlink.
- Pipeline seletivo com filtros antes do ranking, orçamento, modo shadow, context bundle e reason codes.
- Manifest v2, eventos de continuidade/memória/retrieval, policies, ADR-020 a ADR-031 e runbooks.
- Skill `memory-curator` explicit-only e catálogo dos 24 casos v0.2.
- Compatibilidade preservada: todos os 31 testes v0.1 continuam passando.
- Build chama o compilador TypeScript diretamente para tolerar `node_modules` compartilhado entre Windows e WSL.

Esta alpha ainda usa o adapter de thread indisponível por padrão. Aplicação efetiva da configuração de memória e sandbox depende da futura integração Codex.

## 0.1.0-alpha.1 — 2026-09-11

- Contratos JSON Schema, ADRs e invariantes iniciais.
- CLI WAC com motor simulado, aprovação humana por hash, estado retomável e avaliação.
- Store por perfil fora do Git, publicação de checkpoints por rename e lock por run.
- Manifest, trace JSONL com atributos permitidos e redação defensiva.
- Templates inativos de perfil pessoal/trabalho e fixtures sintéticas.
- Testes determinísticos, demonstração local e lock de componentes.

Esta alpha não executa Codex, não carrega overlays e não comprova sandbox real. A release v0.1 depende dos marcos restantes do blueprint.
