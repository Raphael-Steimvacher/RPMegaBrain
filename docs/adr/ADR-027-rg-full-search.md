# ADR-027 — rg como busca FULL preferencial

Status: aceita em 11/09/2026.

## Decisão

O mecanismo FULL prefere `rg --json` depois de validar registro, workflow, sensibilidade, raiz real, symlinks, includes e excludes. Se o executável não estiver disponível, usa um scanner filesystem read-only com os mesmos limites e filtros.

## Consequências

A busca é local, inspecionável e sem índice autoritativo adicional. A fonte continua disponível em ambientes mínimos, como WSL sem `ripgrep`, e o evento `source.scanned` registra o backend usado.
