# Continuidade

Use `megabrain checkpoint create`, `list`, `inspect` e `verify` para administrar checkpoints v0.2. Para retomar, execute `megabrain resume TASK_ID --profile PROFILE`. O runtime tenta a thread quando disponível e sempre valida o checkpoint antes. `--new-thread` força a cápsula em uma thread nova; `--checkpoint ID` escolhe um marco; `--no-recovery` evita criar o checkpoint de recuperação.

Drift de policy recusa a retomada. Drift de skill exige confirmação explícita com `--accept-drift`. Alteração ou ausência de arquivo coberto por plano aprovado bloqueia a retomada. Se o `current` estiver corrompido, o store só usa um checkpoint anterior por fallback explícito e registra o evento.
