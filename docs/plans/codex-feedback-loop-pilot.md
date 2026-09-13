# Plano de execução — piloto do adapter de telemetria do Codex

**Status:** pronto para implementação controlada  
**Especificação:** `docs/specifications/codex-feedback-loop-adapter.md`  
**Profiles:** `personal` somente  
**Repositório de pré-piloto:** fixture Git sintética fora do runtime  
**Repositórios piloto:** `dotfiles` e `Documentos/Github/Node`

## 1. Resultado pretendido

Entregar um adapter local, desabilitado por padrão, que pode ser instalado de forma
explícita em um repositório confiável do Codex. Ele recebe eventos de hook, descarta
todo conteúdo bruto, persiste apenas telemetria permitida no estado privado do
MegaBrain e gera um Evidence Bundle v0.4 somente quando o usuário o vincula a um
Task Contract congelado.

A entrega termina com o runtime validado e pronto para instalação. O primeiro uso é
uma fixture Git sintética fora do runtime; só depois dela os dois repositórios piloto
podem receber hooks. Cada instalação externa continua sendo uma operação confirmada
separadamente, pois escreve `.codex/hooks.json` fora deste repositório.

## 2. Revalidação da especificação

| Afirmação | Resultado | Evidência |
|---|---|---|
| O v0.4 já contém Bundle, eval, diagnose, pattern e proposal. | Confirmado | `src/application/evaluation/service.ts` |
| O Bundle é criado apenas por input explícito e sua integridade pode bloquear a avaliação. | Confirmado | `buildEvidence` e `runEvaluation` no mesmo serviço |
| O runtime não tem adapter Codex real. | Confirmado | `README.md`, `docs/implementation-status.md`, ausência de `.codex/` no runtime |
| Eventos v0.2/v0.3 são JSONL privado e metadata-only. | Confirmado | `src/infrastructure/v2/events.ts`, `src/infrastructure/v3/events.ts` |
| Hooks oficiais do Codex oferecem JSON no stdin e eventos de sessão/ferramenta. | Confirmado | [Hooks do Codex](https://learn.chatgpt.com/docs/hooks) |
| Hooks são enforcement ou capturam todas as ferramentas. | Incorreto se assumido | A documentação exclui ferramentas hospedadas e permite caminhos especializados; o plano os trata apenas como observação parcial. |
| Os dois pilotos já têm configuração `.codex`. | Incorreto | Inspeção em 2026-09-12: ambos são repositórios Git limpos e não possuem `.codex/`. |

## 3. Fluxo alvo e limites de dados

```text
hooks.json do repo
  └─ comando constante do MegaBrain, JSON do Codex no stdin
      └─ HookInputSanitizer (descarta envelope e conteúdo banido)
          └─ CodexHookJournal por profile/sessão
              └─ ligação humana a Task Contract frozen
                  └─ EvidenceAssembler → EvaluationService.buildEvidence
                      └─ eval / diagnose / pattern existentes
```

O fluxo nunca lê ou persiste `transcript_path`, `prompt`, `last_assistant_message`,
`tool_input`, resultado de ferramenta, stdout/stderr ou erro bruto. Nem mesmo hashes
desses campos entram no journal. O adapter não chama rede, não emite contexto para o
modelo, não bloqueia ferramenta e não altera a memória nativa do Codex.

## 4. Achados e riscos que guiam o plano

### Ordenação e concorrência

Vários hooks podem ocorrer na mesma sessão e hooks de background podem terminar fora
da ordem. Para não produzir falsa precisão, a primeira entrega configura handlers de
comando síncronos, observacionais, com timeout curto explícito. A escrita usa lock por
`session_ref`; o `sequence_id` é atribuído dentro do lock. Falha/timeout do handler não
retorna decisão de bloqueio, portanto não é policy de ferramenta.

Sequência protegida: dois `PostToolUse` chegam em paralelo → ambos tentam obter o lock
da mesma sessão → o primeiro grava e incrementa a sequência → o segundo relê/atribui a
próxima sequência → o journal fica total e sem atualização perdida. Sem esse lock,
ambos poderiam gravar a mesma sequência e o Evidence Bundle aceitaria uma ordem falsa.

### Idempotência e fim de sessão

Hooks podem ser reenviados ou `SessionEnd` pode não ocorrer. A chave idempotente deve
ser formada de `session_ref`, evento, `turn_ref`, `tool_call_ref` e timestamp
normalizado. Reentrega idêntica não gera nova linha. A ausência de `SessionEnd` gera
evidência `partial`; não é convertida em sucesso. Após selo, evento novo é recusado com
`HOOK_EVENT_AFTER_SEAL`, preservando o hash do journal que fundamenta a evidência.

### Integridade da configuração

Cada registration guarda o hash do `hooks.json` que a instalação produziu. Antes de
associar sessão ou gerar Evidence Bundle, o runtime compara o hash atual. Isso evita a
sequência: usuário/terceiro altera o hook → eventos passam a vir de comando diferente →
o MegaBrain atribui a telemetria a uma configuração aprovada. O resultado é
`HOOK_CONFIG_DRIFT`, nunca um fallback silencioso.

### Privacidade

O JSON do hook é entrada hostil e pode conter prompt/comando/segredo. O sanitizador
deve operar antes de logs, serialização, mensagens de erro e hash. Testes precisam
incluir segredos sintéticos em cada campo banido e provar ausência em todos os arquivos
do state root.

## 5. Plano por processo

### P1 — Contrato de telemetria e persistência privada

**Dependência:** nenhuma.  
**Habilita:** ingestão segura e testes de privacidade.

1. Adicionar tipos, schemas estritos e reason codes para registration, evento
   sanitizado, selo e resultado de ingestão.
   - Locais: novos contratos em `src/domain/`; schemas em `core/schemas/`; registro no
     validador existente.
   - Preservar: schemas v0.1–v0.5 e seus leitores não podem mudar de significado.
   - Validar: fixtures com campos extras devem falhar; o tipo persistido não pode
     declarar campos de conteúdo bruto.
2. Implementar `CodexHookJournalStore` com diretórios privados, `atomicWrite`, lock
   por sessão, deduplicação e selo hash-bound.
   - Padrões a reutilizar: `EventLogV2`, `V4Store`, `FilesystemCheckpointStore`.
   - Validar: concorrência de duas gravações, reentrega idêntica, path/symlink inseguro,
     profile divergente e evento após selo.
3. Implementar `HookRegistrationStore` fora do Git com identidade estável do repo e
   hash da configuração instalada.
   - Validar: cross-profile e cross-repository bloqueados; registro mutável só por
     operação versionada explícita.

### P2 — Sanitizador e entrypoint de hook

**Dependência:** P1.  
**Habilita:** observação real sem transformar o hook em mecanismo de autorização.

1. Criar `HookInputSanitizer` que lê um único objeto JSON do stdin com limite de bytes,
   rejeita schema inesperado e extrai somente campos permitidos.
   - Permitir: IDs da sessão/turn/chamada, nome de evento/ferramenta, timestamp,
     modelo, modo de permissão e fonte da sessão.
   - Descartar incondicionalmente: transcript, prompt, mensagens, tool input/output,
     cwd bruto, erros e campos desconhecidos.
2. Criar subcomando interno do CLI para ser chamado pelo `hooks.json`.
   - Recebe constantes de profile e repository registration; o JSON vai pelo stdin.
   - Não constrói comando de shell com campo de entrada; não produz stdout/contexto e
     retorna zero em falhas observacionais esperadas.
   - Adicionar timeout de implementação e métrica local de rejeição sem payload.
3. Mapear eventos Codex para estados observacionais. `PreToolUse` é intenção,
   `PostToolUse` é término observado, e nenhum dos dois é prova de êxito da ferramenta.
   `PermissionRequest` gera observação `PROMPT`, sem inferir consentimento humano.

### P3 — Gerador, instalação e drift de hooks

**Dependência:** P1 e P2.  
**Habilita:** configuração visível e reversível por repositório.

1. Gerar `hooks.json` canônico com handlers somente para eventos aprovados e caminho
   absoluto/constante do binário compilado do MegaBrain.
   - O gerador deve usar handlers de comando síncronos e timeout curto; não usar
     `additionalContext`, `permissionDecision`, `continue: false` ou bypass de trust.
2. Criar comandos `codex hooks install`, `status`, `inspect` e `disable`.
   - `install` exige repo absoluto, profile explícito, confirmação e `--pode-fazer`.
   - Não sobrescrever arquivo existente; `replace` é comando separado e também exige
     confirmação. `disable` remove somente arquivo ainda idêntico ao hash registrado.
3. Antes de `sessions`/`evidence build`, conferir hash do arquivo e registrar
   `HOOK_CONFIG_DRIFT` se divergir.
4. Validar em fixture que o Codex precisa de confiança/revisão do hook; o runtime apenas
   informa esse pré-requisito e nunca tenta contorná-lo.

### P4 — Associação humana e Evidence Bundle

**Dependência:** P1, P2 e P3.  
**Habilita:** avaliação do trace real pelo pipeline existente.

1. Criar comandos `codex sessions list|inspect|seal` e `codex evidence build`.
2. Vincular sessão a Task Contract `frozen`, mesmo profile e registration íntegro.
3. Converter eventos sem conteúdo para o formato de `NormalizedTraceEvent` e chamar
   `EvaluationService.buildEvidence`, sem escrever diretamente no store v0.4.
4. Exigir verificações explícitas por requisito e manter `raw_trace_available: false`.
5. Validar: sessão incompleta gera `partial`; falta de proof gera `INCONCLUSIVE`;
   avaliação/diagnose/pattern preservam a regra atual de três tarefas independentes.

### P5 — Documentação, testes de regressão e piloto controlado

**Dependência:** P1–P4.  
**Habilita:** instalação em repositório sem surpresa operacional.

1. Atualizar `docs/architecture/events.md`, `docs/security/invariants.md`, README e
   runbook de instalação/remoção/diagnóstico.
2. Cobrir schemas, ingestão, concorrência, idempotência, segredo, drift, profile,
   evidência parcial, contrato congelado e toda a sequência P1–P4 em testes Node.
3. Executar `npm run lock` após a alteração de componentes, revisar diff e executar
   `npm run check` no RPMegaBrain.
4. Após aprovação específica de instalação, aplicar o mesmo fluxo primeiro em
   `dotfiles`, depois em `Node`; revisar cada diff antes da escrita e confiar os hooks
   no Codex manualmente.

## 6. Ordem de execução e paralelismo

```text
P1 → P2 → P3 → P4 → P5-runtime → piloto sintético
→ confirmação separada → piloto dotfiles → piloto Node
```

P1 e os fixtures de P5 podem começar em paralelo após congelar os contratos, mas P2 não
deve ser implementado antes do schema/journal. A instalação não começa até P5-runtime e
o piloto sintético passarem. Os dois pilotos não são paralelos: `dotfiles` valida
ergonomia/configuração; `Node` valida convivência com um repositório de estudos que
contém múltiplos projetos e um `AGENTS.md` restritivo.

## 7. Plano de validação

- Unitário: sanitizador para cada evento suportado e cada campo banido.
- Unitário: sequenciamento concorrente, idempotência, selagem e resistência a
  symlink/path traversal.
- Integração: config hash-bound → ingestão fixture → contrato frozen → Bundle → eval →
  diagnosis → pattern.
- Regressão: `npm run lock`, revisão de diff, `npm run check`.
- Pré-piloto: criar um Git temporário com conteúdo sintético, iniciar sessão Codex,
  revisar trust via `/hooks`, executar uma
  ferramenta local inofensiva e confirmar que apenas metadata aparece no state root.
- Piloto negativo: alterar o `hooks.json`, confirmar `HOOK_CONFIG_DRIFT`, restaurar
  manualmente e confirmar que o build volta a exigir revisão.

## 8. Mapa de arquivos previsto

| Área | Arquivos previstos |
|---|---|
| Contratos/schemas | novos `src/domain/codex-hooks.ts`, `core/schemas/codex-hook-*.schema.json`, validador |
| Aplicação | novos `src/application/codex-hooks/*` |
| Infra | novos `src/adapters/filesystem/codex-hooks/*`, `src/infrastructure/codex-hooks/*` |
| CLI | `src/cli/main.ts` ou roteador dedicado `src/cli/codex-hooks.ts` |
| Testes | novo `tests/codex-hooks.test.ts` e fixtures sintéticas |
| Docs | README, eventos, invariantes e runbook específico |
| Piloto externo, depois de confirmação | `/home/raphael_piccoli/dotfiles/.codex/hooks.json`; `/home/raphael_piccoli/Documentos/Github/Node/.codex/hooks.json` |

Os nomes são previsões de planejamento; a implementação deve preservar o padrão real
de organização encontrado no runtime e atualizar este plano se uma fronteira existente
for mais adequada.

## 9. Prontidão para implementação

**Pronta para implementar o runtime:** sim. A especificação foi aprovada, profiles e
pilotos foram definidos, e não há conflito nos repositórios piloto.

**Pronta para instalar hooks externos:** ainda requer confirmação de instalação após a
suíte do runtime passar. Essa confirmação é separada porque cria arquivos em dois
repositórios distintos e exige revisão/confiança manual do Codex.
