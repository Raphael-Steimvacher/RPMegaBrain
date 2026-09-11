# Fontes FULL e recuperação

Copie um template de `core/templates/` para a configuração local, substitua a raiz por um caminho absoluto e mantenha `read_only: true`. Rode `megabrain source doctor SOURCE_ID --registry sources.yaml --profile PROFILE` antes da busca. O adapter prefere `rg`; se ele não estiver instalado, usa automaticamente o scanner filesystem read-only.

`megabrain context build --request request.json --registry sources.yaml --profile PROFILE` aplica filtros rígidos, pesquisa WARM/FULL, limita a participação de memória ao orçamento e grava um context bundle explicável. `megabrain explain-context RUN_ID --profile PROFILE` mostra itens, revisões, hashes, reason codes e se houve injeção. Em `shadow`, o conjunto é calculado e registrado, mas não é injetado.
