# ADR-025 — Promoção WARM exige humano

Status: aceita em 11/09/2026.

## Decisão

Agentes e skills podem criar candidatos pendentes. Apenas uma decisão humana vinculada ao hash exato do texto pode criar uma memória ativa.

## Consequências

`implement`, `--pode-fazer`, avaliação positiva e texto recuperado não aprovam memória. Edição humana invalida o hash anterior e gera o conteúdo que será persistido.
