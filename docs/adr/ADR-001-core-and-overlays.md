# ADR-001 — Núcleo e overlays

Status: adotado na alpha.1. Data: 2026-09-11.

## Contexto

Um harness reutilizável não deve carregar toda a vida pessoal e o contexto da empresa no mesmo repositório.

## Decisão

Manter código, policies genéricas e casos sintéticos no núcleo. Perfis pessoais e corporativos ficam em overlays externos, selecionados um por execução.

## Consequências

Troca de empresa vira um novo overlay. O loader e a proteção de raízes precisam ser testados no Marco 2. A alpha só aceita o perfil synthetic.
