# Desenvolvimento do RPMegaBrain

Leia `README.md` e `docs/implementation-status.md` antes de ampliar o runtime.
O blueprint em `Blueprints/megabrain-blueprint-v0.1.md` é a referência de escopo.

- O núcleo contém somente componentes genéricos e fixtures sintéticas.
- Dados pessoais e corporativos pertencem a overlays externos, nunca a este Git.
- Teach é o padrão do produto; modo implement exige entrada humana e plano aprovado pelo hash atual.
- A flag do produto não concede permissões externas, commits, push ou mudanças destrutivas.
- Para desenvolver este repositório, respeite a autorização explícita do usuário na conversa; a flag da CLI não é uma exigência para editar o próprio harness.
- Não declare enforcement de sandbox, integração Codex ou testes de código reais com base no mock.
- Não persistir chain-of-thought, prompts completos ou saídas brutas em traces.
- Preserve alterações locais do usuário. Não faça commit, push ou auto-merge sem pedido.
- Sem subagentes no runtime da v0.1.

Comandos: `npm ci`, `npm run build`, `npm run check`, `npm run demo`.
Após alterações intencionais de componentes, revise o diff e execute `npm run lock` antes de `npm run check`.
Os arquivos de estado ficam fora do repositório; testes usam diretórios temporários isolados.

Contratos: `schemas/`. Invariantes: `docs/security/invariants.md`.
Eventos: `docs/architecture/events.md`. Decisões: `docs/adr/`.
