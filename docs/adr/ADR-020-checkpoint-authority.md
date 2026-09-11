# ADR-020 — Checkpoint autoritativo

Status: aceita em 11/09/2026.

## Decisão

O checkpoint validado por hash é a autoridade de continuidade. Retomar a thread é uma otimização: se ela não existir, o Continuity Manager cria uma cápsula mínima e continua em uma nova thread. Assim, o estado necessário para retomar não depende da retenção do provedor.

## Consequências

Cada mudança de estado cria um checkpoint imutável encadeado. A thread nunca substitui validação, drift ou aprovações.
