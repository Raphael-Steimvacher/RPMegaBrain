# Especificação técnica — adapter de telemetria do Codex para o Feedback Loop

**Status:** aprovado para planejamento e implementação controlada  
**Alvo:** próxima versão após v0.5  
**Data:** 2026-09-12  
**Perfil padrão:** `personal`

## 1. Objetivo

Adicionar um adapter local e opt-in que receba eventos de lifecycle oficialmente
expostos pelos hooks do Codex, normalize apenas metadados permitidos e os use para
montar Evidence Bundles v0.4. Isso permite que a avaliação, o Trace Analyzer e o
Feedback Loop trabalhem sobre execuções reais, sem alegar que o MegaBrain integra
o Codex nativamente, lê transcript, ou melhora o modelo automaticamente.

O resultado do adapter é evidência reproduzível para avaliar uma tarefa e melhorar
componentes do **harness** por meio do fluxo já existente:

```text
Hook do Codex → coletor sanitizante → journal local por sessão
→ vínculo explícito à Task Contract → Evidence Bundle → eval
→ diagnosis → pattern (casos independentes) → Proposal humana
→ Candidate v0.5, se autorizada
```

## 2. Escopo

### Incluído

- Hooks de projeto, instalados somente por ação explícita do usuário no repositório
  que será observado.
- Recepção de JSON dos hooks `SessionStart`, `PreToolUse`, `PostToolUse`,
  `PermissionRequest`, `Stop`, `Interrupt` e `SessionEnd`.
- Journal de telemetria metadata-only, fora de qualquer repositório Git e separado
  fisicamente por profile.
- Criação explícita de uma sessão observada e vínculo explícito desta sessão a uma
  Task Contract congelada.
- Conversão determinística do journal em `EvidenceBundle` v0.4, com status
  `complete`, `partial` ou `blocked` conforme integridade.
- CLI para instalar, verificar, desabilitar e inspecionar a configuração dos hooks,
  sem modificar configurações globais silenciosamente.
- Testes por fixture dos envelopes de hooks e testes de não persistência de conteúdo.

### Excluído

- Ler `transcript_path`, transcript, prompt completo, mensagens do assistente,
  chain-of-thought, argumentos de ferramentas ou resultados brutos de ferramentas.
- Capturar ferramentas hospedadas que não percorrem o caminho local de hooks.
- Alterar permissões do Codex, aprovar solicitações, bloquear ferramentas, continuar
  turnos ou conceder qualquer capacidade externa.
- Alterar automaticamente memória WARM, ranking, políticas, prompts, modelo,
  configuração do Codex ou código do harness.
- Subagentes no runtime MegaBrain. Eventos de subagente ficam fora da primeira
  versão, mesmo que o Codex os exponha.
- Suporte a hooks globais em `~/.codex` e a auto-instalação em repositórios de
  terceiros.

## 3. Evidência sobre o estado atual

| Afirmação | Estado | Evidência |
|---|---|---|
| O runtime é Node/TypeScript e seu engine atual é `mock`. | Verificado | `package.json`; `src/cli/main.ts`; `src/application/workflow.ts` |
| O Evidence Bundle v0.4 é criado somente a partir de input explícito no CLI. | Verificado | `src/cli/v4.ts`; `src/application/evaluation/service.ts#buildEvidence` |
| O Bundle normaliza eventos, redige output e bloqueia evidência malformada. | Verificado | `src/application/evaluation/service.ts#buildEvidence`; `tests/v4.test.ts` |
| O Trace Analyzer parte de finding falho/inconclusivo e produz hipótese, não causa confirmada. | Verificado | `src/application/evaluation/service.ts#diagnose` |
| Pattern exige três tarefas independentes, exceto caminho urgente. | Verificado | `src/application/evaluation/service.ts#scanPatterns` |
| Eventos v0.2 e v0.3 já são metadata-only e gravados fora do Git por profile. | Verificado | `src/infrastructure/v2/events.ts`; `src/infrastructure/v3/events.ts` |
| Não existe configuração de hook no repositório atualmente. | Verificado em 2026-09-12 | `.codex/` não contém arquivos |
| O adapter Codex real ainda não existe. | Verificado | `docs/implementation-status.md`; `docs/security/invariants.md` |

O Codex documenta hooks de lifecycle configuráveis em `hooks.json` ou em
`config.toml`, inclusive em `<repo>/.codex/`; hooks não gerenciados devem ser
revisados e confiados antes de executar. O formato é a fonte de integração desta
especificação, não o transcript. [Documentação oficial de Hooks do Codex](https://learn.chatgpt.com/docs/hooks)

## 4. Decisões de arquitetura

1. **Hook de projeto, não global.** A configuração será criada apenas em
   `<repo-alvo>/.codex/hooks.json`, sob comando explícito e confirmação do usuário.
   O profile e a identidade do repositório ficam na configuração externa do
   MegaBrain; nada pessoal/corporativo entra no Git do repositório-alvo.
2. **Coleta observacional.** Todos os handlers retornam sucesso sem output e não
   usam decisões de bloqueio ou contexto adicional. O adapter registra observações;
   ele não é enforcement de sandbox ou permissões.
3. **Entrada hostil.** Todo JSON recebido de hook é não confiável. A camada de
   entrada deve extrair uma allowlist e descartar o envelope original antes de
   qualquer escrita ou log de erro.
4. **Vínculo humano antes da avaliação.** Uma sessão não vira Evidence Bundle por
   apenas existir. O usuário a associa a uma Task Contract congelada, especificando
   `profile_id`, `task_id` e a sessão escolhida.
5. **Falha fecha a qualidade, não a sessão.** Evento ilegível, fora de ordem ou
   perdido torna a evidência `partial`/`blocked`; não se fabrica uma sequência
   completa. Falha do coletor não pode bloquear nem encerrar a operação original do
   Codex.
6. **Nenhum texto de conversa no estado.** `transcript_path`, `prompt`,
   `last_assistant_message`, `tool_input`, stdout/stderr, tool result e erro bruto
   são descartados antes da validação do schema persistido. Nem hash desses valores
   é gravado na primeira versão.
7. **Memória nativa do Codex permanece desativada em runs gerenciados.** O adapter
   só registra o estado efetivamente aplicado por um wrapper futuro; ele não pode
   declarar aplicação quando o Codex foi iniciado fora dele.

## 5. Modelo de integração

### 5.1 Configuração e confiança

O comando proposto `megabrain codex hooks install` deve:

1. exigir `--repo` absoluto, `--profile` explícito e `--pode-fazer`;
2. validar que o repositório-alvo não é o diretório de estado e resolver sua
   identidade local;
3. gravar somente `<repo>/.codex/hooks.json` por escrita atômica, recusando
   sobrescrever uma configuração já existente sem uma ação de `replace` separada;
4. registrar, no estado privado, o hash do arquivo instalado, `repository_id`,
   profile, versão do schema e momento de instalação;
5. instruir o usuário a revisar e confiar o hook no Codex. A instalação não pode
   marcar o hook como confiável nem usar `--dangerously-bypass-hook-trust`.

`megabrain codex hooks status --repo ... --profile ...` compara o hash atual com o
registro. Divergência resulta em `HOOK_CONFIG_DRIFT` e bloqueia a associação de novas
evidências até revisão humana. `disable` remove somente o bloco/arquivo que o
MegaBrain registrou e nunca remove uma configuração que tenha sido alterada depois.

### 5.2 Eventos observados

| Hook Codex | Ação do adapter | Dados persistidos |
|---|---|---|
| `SessionStart` | abre/retoma journal por `session_id` | tipo de início, ids pseudonimizados, modo de permissão, modelo, timestamp |
| `PreToolUse` | registra intenção de chamada local | `turn_id`, `tool_use_id`, nome canônico da ferramenta, timestamp |
| `PermissionRequest` | registra que houve pedido, sem o objeto do pedido | ids, nome da ferramenta, timestamp |
| `PostToolUse` | registra término observável | ids, nome, estado do hook e timestamp; sem output |
| `Stop` | fecha o turno lógico | `turn_id`, timestamp, marcador de encerramento |
| `Interrupt` | registra interrupção | `turn_id`, timestamp, marcador de interrupção |
| `SessionEnd` | sela o journal da sessão | timestamp, motivo normalizado, contagens e hash do journal |

`UserPromptSubmit`, `PreCompact`, `PostCompact`, `SubagentStart` e `SubagentStop`
não serão configurados na primeira versão. Em especial, `UserPromptSubmit` expõe o
prompt e portanto ampliaria desnecessariamente a superfície de privacidade.

O Codex expõe `session_id`, `cwd`, `hook_event_name`, modelo e, em hooks de turno,
`turn_id`; eventos de ferramenta também incluem nome e ID da chamada. A documentação
informa que `transcript_path` não é uma interface estável, e que `tool_input` contém
comandos/argumentos; ambos devem ser ignorados. [Campos e cobertura oficiais de Hooks](https://learn.chatgpt.com/docs/hooks)

### 5.3 Envelope interno proposto

O adaptador normaliza o JSON de entrada para este tipo interno antes de persistir:

```ts
interface CodexHookTelemetryV1 {
  schema_version: 1;
  event_id: string;
  observed_at: string;             // ISO-8601 UTC
  repository_id: string;           // alias/hash, nunca cwd absoluto
  profile_id: string;
  session_ref: string;             // HMAC/hash com salt local do session_id
  turn_ref: string | null;         // hash com o mesmo salt
  tool_call_ref: string | null;    // hash com o mesmo salt
  hook_event: 'SessionStart' | 'PreToolUse' | 'PermissionRequest' |
              'PostToolUse' | 'Stop' | 'Interrupt' | 'SessionEnd';
  tool_name: string | null;
  permission_mode: string | null;
  model: string | null;
  session_source: 'startup' | 'resume' | 'clear' | 'compact' | null;
  status: 'success' | 'failure' | 'blocked' | 'unknown';
  reason_code: string | null;
}
```

`tool_name`, `permission_mode`, `model` e `session_source` passam por enum/limite de
tamanho. Valores desconhecidos são substituídos por `unknown`, nunca copiados sem
limite. `status` descreve apenas a observação do hook/coletor; não infere se uma
ferramenta executou com sucesso.

O salt é criado uma vez por profile com permissão `0600`; não sai do state root e não
entra em manifests, Evidence Bundles, logs ou mensagens de erro. Sem o salt, IDs de
sessão não são correlacionáveis fora do perfil.

### 5.4 Persistência e concorrência

```text
<state-root>/profiles/<profile>/codex-hooks/
  registrations/<repository-id>.yaml
  sessions/<session-ref>/events.jsonl
  sessions/<session-ref>/seal.yaml
  locks/<session-ref>.lock
  secrets/session-hash-salt
```

- Diretórios e arquivos seguem o padrão privado existente (`0700` e `0600`).
- Cada linha JSONL é escrita atomicamente sob lock por sessão.
- `event_id` é determinístico sobre `session_ref`, `hook_event`, `turn_ref`,
  `tool_call_ref` e timestamp normalizado. Reentrega idêntica é idempotente.
- Eventos sem `session_id`, profile/registro correspondente ou schema válido são
  descartados e incrementam somente um contador local de rejeição sem payload.
- `SessionEnd` é best effort. Sua ausência não invalida automaticamente o journal;
  a evidência deve marcar `partial` e incluir `SESSION_END_MISSING`.
- O adapter nunca usa o caminho de transcript, ainda que o processo de hook possa
  recebê-lo.

### 5.5 Conversão para Evidence Bundle v0.4

Novo comando proposto:

```sh
megabrain codex evidence build \
  --profile personal \
  --contract CONTRACT_ID \
  --session SESSION_REF \
  --state-dir /caminho/fora-do-git
```

Pré-condições:

1. O registro de hooks para o repositório está íntegro e o hash é o aprovado.
2. A sessão pertence ao profile e a uma única identidade de repositório.
3. O Task Contract está `frozen` e tem o mesmo profile.
4. O usuário fornece ou seleciona a evidência de verificação por requisito; telemetria
   de ferramentas sozinha não prova que o resultado está correto.

Mapeamento:

| Journal sanitizado | `EvidenceBundle` v0.4 |
|---|---|
| `SessionStart`/`SessionEnd` | limites temporais e `execution.duration_ms` quando ambos existem |
| `PreToolUse`/`PostToolUse` | `execution.events`, `tool_calls`, integridade e gaps |
| `PermissionRequest` | `policy.decisions` com `PROMPT` observacional, sem alegar aprovação |
| `Interrupt` | evento `blocked` e reason code `CODEX.TURN_INTERRUPTED` |
| registro/hash da configuração | `manifest.config_hash` e `artifact_refs` |
| verificações fornecidas explicitamente | `verification` e requisitos cobertos |

A conversão não preenche `outcome.output`, `content_hash` ou `content_present` com
texto de chat. `raw_trace_available` é sempre `false`. Ausência de proof válida deixa
o requisito `INCONCLUSIVE`, conforme o avaliador existente.

## 6. Fluxo operacional alvo

1. Usuário cria/congela o Task Contract e instala hooks para um repositório/profile.
2. Codex carrega a configuração se o projeto for confiável; a confiança é resolvida
   pelo próprio Codex, não pelo MegaBrain.
3. Cada hook invoca o coletor com um JSON via `stdin`. O coletor valida tamanho e
   schema, extrai a allowlist e grava somente `CodexHookTelemetryV1`.
4. O Codex continua independentemente do resultado observacional do coletor. O
   handler não produz `additionalContext` nem decisão de bloqueio.
5. Ao fim ou durante a tarefa, o usuário manda construir o Evidence Bundle para uma
   sessão e adiciona as verificações necessárias.
6. `eval run`, `diagnose run` e `pattern scan` usam o pipeline v0.4 existente.
7. Um pattern confirmado pode originar Proposal; toda edição do harness continua no
   Candidate Pipeline v0.5, com aprovações separadas.

## 7. Comportamento de falha

| Condição | Resultado |
|---|---|
| Hook ausente, não confiado ou desabilitado no Codex | Nenhum evento é recebido; o MegaBrain informa `HOOK_NOT_ACTIVE`, sem alegar observabilidade. |
| JSON inválido ou acima do limite | Coletor encerra com sucesso observacional, descarta input, registra contador e `HOOK_INPUT_REJECTED`. |
| Registro/profile/repo não confere | Descarta antes de persistir; `PROFILE_MISMATCH`/`REPOSITORY_MISMATCH`. |
| Lock ocupado ou disco indisponível | Handler retorna sucesso sem output; evidencia futura marca telemetria incompleta se o usuário tentar usá-la. |
| `SessionEnd` ausente | Journal permanece disponível, mas Evidence Bundle recebe `partial`. |
| Configuração de hook mudou | `HOOK_CONFIG_DRIFT`; build de Evidence é bloqueado até revisão/reinstalação explícita. |
| Tentativa de usar texto bruto como evidência | `RAW_CONTENT_FORBIDDEN`; não há fallback de redação após a persistência. |

## 8. Segurança e privacidade

- O envelope completo de hook deve existir somente em memória durante a allowlist;
  não pode aparecer em logs, exceções, arquivos temporários ou testes de snapshot.
- O coletor deve rejeitar symlinks em state root, registration e journal, seguindo as
  defesas já presentes nos stores v0.2/v0.4.
- Um profile não lista, sela, correlaciona ou constrói evidência de sessões de outro
  profile. `personal` e `work.colmeia` têm salts, locks e diretórios distintos.
- Nenhuma configuração instalada pode usar rede, `curl`, ferramentas remotas,
  permissões de escrita de projeto ou comandos de shell derivados do JSON recebido.
- O comando de hook é constante e com caminho absoluto para o binário instalado; IDs
  de sessão, paths e nomes de ferramenta entram por `stdin`, nunca por interpolação
  de shell.
- O adapter deve executar em tempo curto e ter testes de timeout. Hooks assíncronos
  podem ser cancelados no final da sessão; por isso não são base de garantia de
  integridade ou autorização.
- Eventos observacionais não autorizam WARM, conectores, Candidate, `--pode-fazer`,
  merge, push ou qualquer escrita externa.

Essas regras preservam `INV-TRACE-002`, `INV-SEC-001`, `INV-SEC-002`, a separação de
profiles e a decisão de que transcript não é integração.

## 9. Alterações técnicas necessárias

### Core e domínio

- Adicionar `CodexHookTelemetryV1`, `HookRegistrationV1` e resultados tipados para
  instalação, ingestão, selagem e build de evidência em `src/domain/`.
- Criar JSON Schemas em `core/schemas/` e registrá-los no validador. Schemas devem ter
  `additionalProperties: false` e não expor campos banidos.
- Adicionar reason codes fechados, ao menos: `HOOK_NOT_ACTIVE`,
  `HOOK_INPUT_REJECTED`, `HOOK_CONFIG_DRIFT`, `SESSION_END_MISSING`,
  `RAW_CONTENT_FORBIDDEN`, `REPOSITORY_MISMATCH` e `CODEX.TURN_INTERRUPTED`.

### Application

- Criar `CodexHookCollector` e `CodexEvidenceAssembler` sem dependência direta de
  filesystem ou do CLI.
- Reusar `EvaluationService.buildEvidence` como única porta para criar Evidence
  Bundles; o assembler não grava diretamente em `evaluation/evidence`.
- Acrescentar validação de vínculo `registration → repository → session → contract`.

### Infraestrutura

- Criar stores filesystem privados para registration e journals, com lock por sessão,
  escrita atômica e idempotência.
- Criar executável/entrypoint mínimo que leia **um** JSON de `stdin`, não emita stdout
  e retorne zero em falhas observacionais esperadas.
- Implementar gerador e parser estrito de `.codex/hooks.json`; ele deve comparar o
  arquivo existente byte a byte/hash antes de substituir ou remover.
- Estender `docs/architecture/events.md` e `docs/security/invariants.md` com os novos
  eventos e limites comprovados.

### CLI e experiência do usuário

- `megabrain codex hooks install|status|disable|inspect`
- `megabrain codex sessions list|inspect|seal`
- `megabrain codex evidence build`

Todos os comandos de escrita exigem profile explícito e mostram destino, profile,
identidade do repositório e o que será persistido. `install`, `replace` e `disable`
exigem confirmação explícita e `--pode-fazer`; `evidence build` exige contrato
congelado, mas não libera edição de código.

## 10. Requisitos de teste e aceite

| ID | Cenário verificável | Resultado esperado |
|---|---|---|
| A1 | Instalar hooks em repo confiável simulado | Só cria o arquivo declarado e registration hash-bound; não altera configuração global. |
| A2 | Reinstalação do mesmo arquivo | Idempotente, sem duplicar handlers. |
| A3 | Arquivo de hook modificado após instalação | `status` detecta drift e `evidence build` bloqueia. |
| A4 | `UserPromptSubmit` com segredo/prompt | Não é configurado; nenhum texto é persistido. |
| A5 | `PreToolUse` com comando contendo segredo | Journal retém somente IDs/metadata permitida; comando não aparece nem como hash. |
| A6 | Sessão válida com início, ferramenta e fim | Journal ordenado, selado e convertido em Evidence Bundle íntegro. |
| A7 | Evento fora de ordem ou fim ausente | Bundle `partial`/`blocked`; diagnóstico não trata a lacuna como sucesso. |
| A8 | Profile e repositório divergentes | Ingestão/associação bloqueada, sem arquivo em outro profile. |
| A9 | Falha de disco/lock no handler | Nenhuma ferramenta do Codex é bloqueada; observabilidade informa degradação. |
| A10 | Evidence sem verificação por requisito | Avaliação fica `INCONCLUSIVE`; tool calls não contam como proof. |
| A11 | Três tarefas independentes com mesmo finding | Pattern é confirmado; retries da mesma task não confirmam. |
| A12 | Proposal aprovada | Não altera harness sem Candidate v0.5 e aprovações próprias. |
| A13 | Suite de regressão | `npm run check` continua passando, incluindo os contratos v0.1–v0.5. |

## 11. Métricas e observabilidade

Registrar somente contagens agregadas e reason codes:

- hooks recebidos/aceitos/rejeitados por sessão;
- eventos por tipo, sessões seladas e sessões parciais;
- tempo de ingestão e contenção de lock;
- builds de Evidence por status de integridade;
- evals `PASS`/`FAIL`/`INCONCLUSIVE`/`BLOCKED`;
- patterns por quantidade de tarefas independentes;
- drift de configuração e tentativas de persistência de conteúdo banido.

Não há métrica de “performance do modelo” nesta versão. Qualquer conclusão de melhora
exige uma suite de avaliação com baseline, candidate congelada e comparação válida;
um trace isolado não mede qualidade.

## 12. Compatibilidade e rollout

1. Lançar a integração desabilitada por padrão, sem hooks instalados.
2. Fazer piloto em um repositório sintético e profile `synthetic` ou `personal` sem
   conteúdo sensível.
3. Validar fixtures contra a versão instalada do Codex e documentar o hash/versão
   observados; os schemas oficiais podem evoluir.
4. Habilitar por repositório, após revisão humana do arquivo de hook no Codex.
5. Não migrar nem reinterpretar traces v0.1–v0.5; o novo journal tem schema próprio.

O adapter de hooks é o **plano de observação**: registra telemetria de sessões iniciadas
fora do MegaBrain. Um `CodexEngine` sobre SDK/App Server é uma entrega posterior e
separada, o **plano de controle**, responsável por criar/retomar threads e por tratar
aprovações e eventos estruturados. A ausência dele não pode ser ocultada pelo adapter
de hooks.

## 13. Decisões aprovadas

1. **Retenção:** manual, sem purge automático nesta entrega. Uma política de retenção
   e backup é requisito de uma evolução posterior.
2. **Profiles do piloto:** neste computador, os pilotos em `dotfiles` e `Node` usam
   exclusivamente `personal`. Um piloto `work.colmeia` será especificado e aprovado
   separadamente quando o harness for instalado no computador corporativo.
3. **Tipo de instalação:** somente `.codex/hooks.json` por repositório. Plugin
   empacotado permanece fora do escopo.
4. **Sessão sem contrato prévio:** o journal pode ser coletado antes do contrato, mas
   não pode virar Evidence Bundle até o vínculo humano a um contrato congelado.
5. **Verificação de ferramenta:** `PostToolUse` é telemetria observacional, não prova
   de sucesso; proof continua explícita por requisito.

### Repositórios do piloto inicial

- `/home/raphael_piccoli/dotfiles`
- `/home/raphael_piccoli/Documentos/Github/Node`

Ambos ficam vinculados ao profile `personal`. A instalação adicionará um arquivo novo
`.codex/hooks.json` em cada repositório, somente após a implementação passar na suíte
do RPMegaBrain e uma confirmação de instalação separada.

## 14. Referências

- `Blueprints/megabrain-blueprint-v0.2.md` — portas, limites de memória e transcript.
- `Blueprints/megabrain-blueprint-v0.5.md` — Candidate Pipeline e não integração
  automática.
- `docs/architecture/events.md` — política metadata-only.
- `docs/security/invariants.md` — limites de segurança e ausência de adapter real.
- `docs/adr/ADR-005-observability-from-day-one.md`.
- `docs/adr/ADR-007-human-gated-feedback.md`.
- `docs/adr/ADR-026-disable-native-codex-memory.md`.
- `docs/adr/ADR-031-transcript-is-not-integration.md`.
- `src/application/evaluation/service.ts` — Bundle, avaliação, diagnóstico e pattern.
- `src/infrastructure/v2/events.ts` — precedente de evento metadata-only.
- [Hooks do Codex — documentação oficial](https://learn.chatgpt.com/docs/hooks).
