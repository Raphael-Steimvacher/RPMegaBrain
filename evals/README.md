# Evals

`cases/initial.json` preserva os 15 cenários v0.1. `cases/v0.2/catalog.json` registra os 24 casos novos de memória, recuperação, continuidade, privacidade e observabilidade.

Os testes em `tests/` executam contratos e integrações locais com fixtures sintéticas fisicamente separadas por perfil. Eles cobrem os gates de segurança do núcleo, mas não são evals de qualidade de modelo. Baselines de Precision@5, recall crítico, uso de contexto, latência e tokens exigem o futuro adapter Codex e resultados revisados por humano.

Fixtures reais precisam ser sanitizadas antes de entrar no repositório. Overlays e fontes pessoais/corporativas permanecem fora do Git.
