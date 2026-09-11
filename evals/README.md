# Evals

`cases/initial.json` cataloga os 15 cenários do blueprint (4 definição, 4 planejamento, 2 debugging, 2 review, 2 adversariais, 1 retomada). Ainda não é uma suite executável de modelo nem um baseline.

`fixtures/wac.json` e `fixtures/repository/` são sintéticos. Os testes de contrato e integração do software estão em `tests/core.test.ts` e executam por `npm run check`. Esses testes não medem a qualidade de um LLM.

No Marco 7, cada cenário precisa de entrada completa, snapshot, critérios verificáveis, resultado do modelo e verdict humano. Só então medir tokens por tarefa aceita e comparar versões.
