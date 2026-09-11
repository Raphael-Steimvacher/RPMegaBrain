# ADR-024 — Um perfil por run

Status: aceita em 11/09/2026.

## Decisão

Um run pertence a exatamente um perfil. Checkpoints, memória, índices, eventos e registros de fonte ocupam diretórios físicos distintos. Todo item recuperado precisa declarar o mesmo `profile_id`.

## Consequências

Mistura cross-profile é falha de segurança. Ranking só ocorre depois dos filtros de perfil, workflow, sensibilidade, status e caminho.
