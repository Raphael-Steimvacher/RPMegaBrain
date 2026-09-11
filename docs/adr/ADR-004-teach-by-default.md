# ADR-004 — Ensinar por padrão

Status: adotado na alpha.1. Data: 2026-09-11.

## Contexto

O usuário quer compreender e escrever o próprio código, com implementação assistida apenas quando solicitada.

## Decisão

Teach é o padrão. --pode-fazer significa implement e exige plano aprovado pelo usuário com hash atual. Cada continuação sem flag e toda revisão voltam a teach.

## Consequências

O gate está implementado e testado. Enforcement de escrita real depende de sandbox e não pode ser inferido da obediência do mock.
