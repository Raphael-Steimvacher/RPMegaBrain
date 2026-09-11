# ADR-029 — Curator apenas propõe

Status: aceita em 11/09/2026.

## Decisão

A skill `memory-curator` é invocada explicitamente, propõe até três itens e encerra com candidatos pendentes. Ela não aprova, não persiste WARM ativa e não escreve em FULL.

## Consequências

Curadoria e autorização permanecem etapas distintas. O runtime aplica o mesmo gate mesmo que um prompt tente pedir promoção automática.
