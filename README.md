# RPMegaBrain

Harness pessoal ao redor do Codex, construído a partir do blueprint v0.1.

**Versão atual: `0.1.0-alpha.1`.** Esta entrega implementa os contratos e um ciclo WAC com motor simulado. Você pode iniciar, aprovar artefatos, retomar, revisar o fluxo e registrar avaliação sem chamar IA ou pagar por serviços.

O mock não consulta repositórios, não investiga bugs, não altera código e não executa testes do projeto-alvo. As respostas fixas estão marcadas como simulação. O modo `implement` exercita o gate de aprovação, mas não escreve código nesta alpha. A v0.1 completa ainda não está pronta.

## Começar

Requisitos: Node.js 24+ e npm. Windows é o ambiente validado nesta entrega; os caminhos Linux seguem XDG e precisam de validação operacional no Linux. Git é opcional para executar uma cópia; quando disponível, seu commit entra no manifest.

Na raiz do repositório:

```sh
npm ci
npm run check
npm run demo
```

`demo` executa uma WAC sintética, simula as aprovações humanas exclusivamente para a demonstração, mostra o run ID e o diretório temporário de estado. Não acessa credenciais nem chama o Codex. Esse diretório é mantido para você inspecionar os arquivos.

## Executar um checkpoint por vez

```sh
npm start -- wac WAC-SYNTH-001 --profile synthetic --task-file evals/fixtures/wac.json
```

A saída contém o `run_id`, a definição, seu hash e a próxima ação. Substitua `RUN_ID` e os hashes abaixo pelos valores exibidos:

```sh
npm start -- approve RUN_ID definition --hash sha256:HASH_DA_DEFINICAO
npm start -- resume RUN_ID
npm start -- resume RUN_ID
```

O primeiro `resume` faz a investigação simulada; o segundo produz o plano. Leia o plano, aprove seu hash e continue:

```sh
npm start -- approve RUN_ID plan --hash sha256:HASH_DO_PLANO
npm start -- resume RUN_ID
npm start -- review RUN_ID
npm start -- resume RUN_ID
```

O run agora está `verified`: apenas a integridade da aprovação foi verificada. A revisão e a investigação de código continuam simuladas.

Para exercitar o outro caminho, use `resume RUN_ID --pode-fazer` imediatamente após aprovar o plano. É equivalente a `--mode implement`. Iniciar uma WAC com essa flag falha porque ainda não há plano aprovado. O próximo comando sem flag volta a `teach`; `review` também volta a `teach`.

## Avaliar

Crie um arquivo YAML fora do repositório, preenchendo `run_id` e suas notas de 1 a 5:

```yaml
schema_version: 1
run_id: UUID_DO_RUN
verdict: accepted
hard_failures: []
scores:
  technical_correctness: 4
  requirement_coverage: 5
  actionability: 4
  teaching_clarity: 5
  efficiency: 3
corrections: []
user_notes: "Avaliação da simulação, sem execução real de código."
```

```sh
npm start -- eval RUN_ID --file CAMINHO_DA_AVALIACAO.yaml
npm start -- status RUN_ID
npm start -- trace RUN_ID
```

Veredictos: `accepted`, `accepted_with_corrections`, `rejected`, `blocked`. Uma falha grave exige `rejected` ou `blocked`; a média ponderada não a compensa. As categorias válidas estão em `schemas/evaluation.schema.json`. Uma avaliação pertence exatamente a um run. O schema de propostas de melhoria já existe, mas sua geração pertence aos marcos posteriores.

## Onde os dados ficam

Precedência: `--state-dir` → `MEGABRAIN_STATE_HOME` → diretório do sistema.

- Windows: `%LOCALAPPDATA%/megabrain`.
- Linux: `$XDG_STATE_HOME/megabrain`, ou `~/.local/state/megabrain`.
- O estado não pode ficar dentro do núcleo ou de qualquer repositório Git.

Cada run fica em `profiles/synthetic/runs/RUN_ID/`. Cada operação publica uma nova pasta numerada contendo `checkpoint.json`, `run-manifest.yaml`, `task-state.yaml`, `trace.jsonl` e `result.md`; a avaliação acrescenta `evaluation.yaml`.

`checkpoint.json` é a fonte de verdade. Os YAMLs, Markdown e JSONL são projeções para inspeção. Cada revisão traz o trace acumulado, portanto use a revisão mais recente; não concatene todas. Não edite os checkpoints para aprovar planos: use `approve` e o hash apresentado. A máquina protege contra erros e concorrência acidental, não contra o próprio usuário adulterando os arquivos com acesso ao sistema.

O HOT state contém a descrição sintética, artefatos e aprovações necessários à retomada. Isso é diferente do trace, que guarda somente metadados permitidos. Os filtros de credenciais são uma defesa adicional, não garantia de anonimização de qualquer texto. Use somente dados sintéticos nesta versão. Retenção automática ainda não foi implementada.

## Retomada e recuperação

`resume` carrega o último checkpoint completo, compara o hash da configuração e conserva a thread simulada. Não relê o arquivo original da tarefa: utiliza o snapshot salvo. Nesta alpha, mudança de runtime/configuração exige um run novo; migração e reconstrução seletiva de contexto ficam para o Marco 3.

Pastas `.pending-*` são revisões incompletas e não são selecionadas. Uma revisão completa corrompida provoca erro explícito; não se usa uma revisão anterior silenciosamente. Os checkpoints anteriores permanecem disponíveis para inspeção manual.

Há um lock por run. Se um processo encerrar abruptamente, primeiro confirme que nenhum MegaBrain está usando aquele run. Depois remova **somente a pasta vazia `.lock` daquele run** e execute `status`. Não há desbloqueio automático por tempo, para evitar dois processos gravando simultaneamente. A publicação por rename protege interrupções entre arquivos; durabilidade contra queda de energia/fsync ainda não está garantida.

## Desenvolver

```sh
npm run build
npm run lock
npm run check
```

`check` compila TypeScript em modo estrito, executa a suite determinística, valida templates/fixtures e confere `megabrain.lock.yaml`. O lock fixa hashes de fontes, schemas, perfis, policies e dependências; o SDK Codex aparece como `null` porque ainda não está instalado.

Os templates de trabalho e pessoal são exemplos **inativos**. São JSON válido dentro de arquivos YAML, aceito pelo parser YAML. O runtime exige `--profile synthetic`; não escolhe perfil nem fontes com base na descrição da tarefa. As policies YAML documentam e participam dos hashes; o gate atual é código determinístico. O interpretador de capabilities e o sandbox real são trabalho do Marco 2/4.

## Próximos marcos

Consulte `docs/implementation-status.md` para a separação entre implementado e planejado. O próximo incremento é o loader de overlays e a composição de permissões; depois entram busca com `rg`, proveniência, skills e adapter Codex. OpenTelemetry/Aspire vem após o contrato JSONL já existente.

O [SDK oficial do Codex](https://learn.chatgpt.com/docs/codex-sdk) oferece start/continue/resume de threads locais. As capacidades de sandbox, cancelamento, ambiente e eventos precisam ser verificadas contra a versão instalada no Marco 4 antes de qualquer alegação de segurança real.
