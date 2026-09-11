# ADR-008 — Node 24 e estado local multiplataforma

Status: adotado na alpha.1. Data: 2026-09-11.

## Contexto

O rascunho cita Linux; a implementação inicial está sendo executada no Windows com Node 24 instalado.

## Decisão

Adotar Node 24 como mínimo do projeto, APIs nativas de teste/CLI e caminhos XDG no Linux ou LOCALAPPDATA no Windows. Estado nunca fica no Git.

## Consequências

Essa é uma escolha operacional do projeto, não um requisito alegado do SDK Codex. Windows validado nesta entrega; execução Linux ainda deve ser verificada.
