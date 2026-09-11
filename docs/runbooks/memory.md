# Memória WARM

`megabrain memory propose TASK_ID --file candidate.yaml --profile PROFILE` cria um candidato pendente. Leia o candidato e use seu `statement_hash` em `memory review CANDIDATE_ID --decision approve --expected-hash HASH`. Para editar, forneça `--decision edit_and_approve --statement-file ...`; somente o texto editado vira canônico.

Use `search`, `explain`, `history`, `conflicts`, `expire`, `revoke` e `rebuild-index` para operar o ciclo. Aprovação nunca é herdada do modo `implement`. Revogação e conflito preservam histórico e removem o item da recuperação ativa.
