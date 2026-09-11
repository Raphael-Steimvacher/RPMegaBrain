# Taxonomia de eventos v1

Todo evento tem versão, timestamp UTC, sequência monotônica por run, run/task IDs, produtor, fase, resultado, duração e atributos. A alpha emite eventos pontuais com `duration_ms: 0`; não interpreta esse valor como medição de latência do motor.

## Emitidos na alpha

- `run.started`, `profile.selected`, `workflow.selected`, `policy.composed`.
- `task.state_changed`, `approval.recorded`, `mode.changed`.
- `engine.thread_started`, `engine.thread_resumed`, `engine.completed`, `engine.cancelled`.
- `policy.blocked`, `run.failed`.
- `verification.completed`, `evaluation.recorded`, `run.completed`.

O campo `simulated` identifica os checkpoints do mock. `verification.completed` comprova apenas o hash da aprovação. `run.completed` informa que o ciclo terminou; o verdict pode ser rejeitado e deve ser consultado separadamente. Erros do motor são registrados em `run.failed` com código genérico, preservando o estado anterior. Falhas de CLI anteriores à criação do run vão para stderr, sem criar run artificial.

## Reservados pelos contratos

- `skill.selected`.
- `context.lookup_started`, `context.item_selected`, `context.item_rejected`, `context.bundle_built`.
- `engine.failed`, `tool.started`, `tool.completed`, `tool.failed`.
- `feedback.proposed`, `feedback.rejected`.

Serão emitidos quando os componentes correspondentes existirem. Não criar eventos fictícios para parecer que uma ferramenta ou fonte foi utilizada.

## Persistência

Cada revisão publica um trace JSONL acumulado. Sequências e identidades são validadas junto com o checkpoint; retomada não reinicia a sequência. Prompts, respostas completas, erros brutos e raciocínio interno não são atributos. O resultado sintético fica no HOT state e em `result.md`, fora do trace e do Git.
