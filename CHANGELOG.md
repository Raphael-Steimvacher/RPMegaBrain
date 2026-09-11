# Changelog

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
