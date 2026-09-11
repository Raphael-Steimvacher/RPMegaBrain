# MegaBrain — Blueprint v0.2

> **Codinome:** Memory & Continuity
>
> **Versão do harness:** 0.2.0
>
> **Status:** pronto para planejamento de implementação
>
> **Data:** 2026-09-11
>
> **Herda:** MegaBrain Blueprint v0.1
>
> **Motor inicial:** Codex
>
> **Princípio:** ensinar por padrão; implementar código de projeto somente com autorização explícita

---

## Índice

1. [Resumo executivo](#1-resumo-executivo)
2. [Relação com a v0.1](#2-relação-com-a-v01)
3. [Objetivos e não objetivos](#3-objetivos-e-não-objetivos)
4. [Princípios e invariantes](#4-princípios-e-invariantes)
5. [Arquitetura](#5-arquitetura)
6. [Modelo HOT, WARM e FULL](#6-modelo-hot-warm-e-full)
7. [Continuidade e checkpoints](#7-continuidade-e-checkpoints)
8. [Memória WARM](#8-memória-warm)
9. [Fontes FULL](#9-fontes-full)
10. [Recuperação seletiva](#10-recuperação-seletiva)
11. [Ciclo de vida da memória](#11-ciclo-de-vida-da-memória)
12. [Conflitos, validade e esquecimento](#12-conflitos-validade-e-esquecimento)
13. [Memória nativa do Codex](#13-memória-nativa-do-codex)
14. [Interfaces e comandos](#14-interfaces-e-comandos)
15. [Estrutura de diretórios](#15-estrutura-de-diretórios)
16. [Contratos e schemas](#16-contratos-e-schemas)
17. [Tracing e observabilidade](#17-tracing-e-observabilidade)
18. [Segurança e isolamento](#18-segurança-e-isolamento)
19. [Evals e métricas](#19-evals-e-métricas)
20. [Migração da v0.1](#20-migração-da-v01)
21. [Plano de construção](#21-plano-de-construção)
22. [Riscos](#22-riscos)
23. [Critérios de aceitação](#23-critérios-de-aceitação)
24. [Definition of Done](#24-definition-of-done)
25. [Roadmap](#25-roadmap)
26. [Decisões registradas](#26-decisões-registradas)
27. [Referências](#27-referências)

---

## 1. Resumo executivo

A v0.2 transforma a ideia de memória do MegaBrain em um sistema operacional, auditável e seguro. O foco não é fazer o agente “lembrar de tudo”, mas permitir que ele:

1. retome uma tarefa sem depender do histórico do chat;
2. reutilize decisões aprovadas sem reinventá-las;
3. encontre conhecimento em fontes pessoais ou profissionais sem carregar tudo;
4. explique por que cada memória ou trecho foi usado;
5. expire, revogue ou coloque em quarentena informação incorreta;
6. preserve isolamento absoluto entre os perfis personal e work.colmeia.

Ela entrega quatro capacidades:

| Capacidade | Resultado |
|---|---|
| Checkpoints duráveis | Retomar uma tarefa mesmo se a thread do Codex desaparecer |
| Memória WARM aprovada | Reutilizar decisões, correções e preferências revisadas |
| Consulta FULL seletiva | Pesquisar Obsidian, repositórios, docs e runbooks sob demanda |
| Proveniência ponta a ponta | Rastrear origem, versão, validade, seleção e uso |

O princípio central é:

> **A conversa ajuda a continuidade, mas o checkpoint é a fonte confiável de retomada.**

Uma thread do Codex será retomada quando disponível, mas será uma otimização. O funcionamento correto não dependerá dela.

Memória também não será alimentada automaticamente por tudo que o modelo vê:

~~~mermaid
flowchart TD
    A["Execução concluída"] --> B["Candidatos de memória"]
    B --> C{"Revisão humana"}
    C -->|Aprovar ou editar| D["WARM ativa"]
    C -->|Rejeitar| E["Rejeição registrada"]
    D --> F["Recuperação futura"]
    F --> G["Uso com proveniência"]
~~~

Não entram na v0.2:

- banco vetorial;
- cópia integral do Obsidian;
- ingestão automática de chats;
- escrita autônoma em fontes FULL;
- conectores Gmail, Jira, GitHub ou Google Drive;
- mudança automática do harness ou auto-merge;
- memória sem aprovação;
- mistura entre contextos pessoal e corporativo.

---

## 2. Relação com a v0.1

A v0.2 estende a v0.1; não a reescreve.

### 2.1 O que permanece

- Codex como primeiro motor.
- Wrapper TypeScript como fronteira do MegaBrain.
- Modo teach por padrão.
- Código de projeto só muda com --pode-fazer.
- Seleção determinística de perfil.
- ColmeIA isolada em overlay próprio.
- Skills carregadas sob demanda.
- Tracing desde o início.
- Feedback propõe mudanças; usuário aprova e regressão decide.
- Segredos e conteúdo corporativo não entram no repositório pessoal.

### 2.2 Delta funcional

| Área | v0.1 | v0.2 |
|---|---|---|
| HOT | Estado atual | Estado mais checkpoints versionados |
| WARM | Estrutura reservada | Memória aprovada e pesquisável |
| FULL | Catálogo | Adapters read-only e busca seletiva |
| Retomada | Sessão/thread | Checkpoint autoritativo; thread opcional |
| Busca | Leitura direta | Filtros, ranking e orçamento |
| Persistência | Estado de tarefa | Candidatos, aprovação, revisão e expiração |
| Índice | Nenhum | SQLite FTS5 derivado para WARM |
| Traces | Eventos de execução | Eventos de memória e continuidade |
| Evals | 15 casos-base | Base mais casos de memória, retomada e segurança |

### 2.3 Hipótese a validar

> Checkpoints estruturados, Markdown aprovado, SQLite FTS5 e busca textual com rg devem oferecer continuidade útil antes de embeddings ou banco vetorial.

Se os evals mostrarem misses semânticos relevantes, será possível trocar o mecanismo de recuperação sem trocar o formato canônico, as políticas ou a proveniência.

---

## 3. Objetivos e não objetivos

### 3.1 Objetivos funcionais

**O1 — Retomada independente da conversa**

Retomar pelo último checkpoint válido, inclusive em nova thread.

**O2 — Memória WARM controlada**

Transformar decisões, correções, preferências e fatos verificados em registros duráveis somente após revisão humana.

**O3 — Consulta FULL**

Pesquisar fontes permitidas do Obsidian, repositórios, docs e runbooks sem importar todo o conteúdo.

**O4 — Recuperação explicável**

Para cada item injetado, registrar por que foi elegível, por que foi selecionado, origem, validade, revisão e execução em que foi usado.

**O5 — Isolamento**

Impedir qualquer recuperação entre personal e work.colmeia.

**O6 — Esquecimento seguro**

Expirar, revogar, substituir e colocar memória em quarentena sem perder auditoria.

**O7 — Custo praticamente zero**

Usar arquivos locais, Git, rg, SQLite FTS5, hooks e telemetria local.

### 3.2 Perguntas que a versão deverá responder

- Quantas tarefas precisaram de contexto antigo?
- Quanto do contexto recuperado foi usado?
- Quais fontes FULL mais ajudam?
- Quais memórias ficaram obsoletas?
- Quantos candidatos foram aprovados, editados ou rejeitados?
- A retomada preserva decisões críticas?
- O ganho de qualidade compensa os tokens adicionais?

### 3.3 Não objetivos

- representar toda a identidade do usuário;
- sintetizar automaticamente o SecondBrain;
- oferecer “memória infinita”;
- guardar chain-of-thought;
- tratar traces como memória;
- permitir ao modelo decidir sozinho o que é verdade permanente;
- substituir documentação por lembranças;
- compartilhar memória entre perfis;
- executar ações externas;
- oferecer colaboração multiusuário.

---

## 4. Princípios e invariantes

### 4.1 Princípios

1. **Memória é dado, não instrução.** Conteúdo recuperado não altera policy, permissão ou modo.
2. **Canônico e índice são diferentes.** Markdown aprovado é a verdade WARM; SQLite é cache reconstruível.
3. **Continuidade não depende da thread.** O checkpoint sustenta a retomada.
4. **Persistência exige intenção.** Atualizar HOT não autoriza promover para WARM.
5. **FULL significa disponível, não carregado.** Só trechos relevantes entram no contexto.
6. **Segurança vem antes do ranking.** Perfil, origem, sensibilidade, estado e validade são filtrados primeiro.
7. **Memória pode estar errada.** Todo item possui origem, confiança, data e ciclo de vida.
8. **Inferência continua inferência.** Hipótese não vira fato por repetição.

### 4.2 Invariantes normativos

| ID | Invariante |
|---|---|
| INV-MEM-001 | Nenhuma WARM fica ativa sem aprovação humana explícita |
| INV-MEM-002 | O modelo nunca escreve diretamente na store canônica |
| INV-MEM-003 | Todo item ativo tem evidência ou origem humana explícita |
| INV-MEM-004 | Item expirado, revogado, conflitante ou em quarentena não é injetado |
| INV-MEM-005 | O índice pode ser apagado sem perda de informação |
| INV-PROFILE-001 | Uma execução tem exatamente um perfil |
| INV-PROFILE-002 | Recuperação cross-profile não existe na v0.2 |
| INV-CONT-001 | Toda transição material cria checkpoint |
| INV-CONT-002 | SessionEnd não é o único gatilho |
| INV-CONT-003 | Retomada valida schema, integridade, perfil e policies |
| INV-CONT-004 | Falha de thread não impede retomada por checkpoint |
| INV-SRC-001 | Fontes FULL são read-only |
| INV-SRC-002 | Texto de fonte é dado não confiável |
| INV-TRACE-001 | Toda seleção ou rejeição possui reason code |
| INV-TRACE-002 | Trace não armazena chain-of-thought |
| INV-SEC-001 | Segredo detectado é removido ou bloqueia persistência |
| INV-SEC-002 | --pode-fazer não aprova memória nem altera isolamento |

Quebrar invariante de segurança, perfil ou aprovação reprova o release mesmo se outras métricas melhorarem.

---

## 5. Arquitetura

### 5.1 Visão lógica

~~~mermaid
flowchart TD
    U["Usuário ou CLI"] --> R["Runtime MegaBrain"]
    R --> C["Continuity Manager"]
    R --> Q["Retrieval Pipeline"]
    C --> B["Context Builder"]
    Q --> B
    B --> A["Codex"]
    A --> V["Verificação e resultado"]
    V --> C
    V --> M["Memory Curator"]
~~~

Quatro subsistemas novos:

1. **Continuity Manager**
   - cria, valida e carrega checkpoints;
   - tenta retomar thread;
   - recupera por nova thread quando necessário;
   - detecta drift.

2. **Memory Store**
   - guarda WARM aprovada;
   - mantém revisões e estados;
   - fornece snapshots reproduzíveis.

3. **Source Registry**
   - descreve FULL permitida;
   - resolve adapters, allowlists e frescor;
   - detecta mudança ou indisponibilidade.

4. **Retrieval Pipeline**
   - interpreta a necessidade;
   - aplica filtros rígidos;
   - pesquisa e ranqueia;
   - monta bundle limitado.

Memory Curator só produz candidatos; não é autoridade de escrita.

### 5.2 Portas e adapters

| Porta | Responsabilidade | Adapter inicial |
|---|---|---|
| ThreadPort | Iniciar e retomar threads | Codex SDK ou app-server |
| CheckpointStorePort | Persistir checkpoints | Filesystem local |
| WarmMemoryStorePort | Guardar canônico | Markdown + filesystem |
| WarmIndexPort | Pesquisar WARM | SQLite FTS5 |
| FullSourcePort | Pesquisar FULL | Filesystem, Git e rg |
| ApprovalPort | Obter decisão | CLI interativa |
| TracePort | Emitir eventos | OTel + JSONL |
| SecretScannerPort | Detectar conteúdo sensível | Regras locais |

O domínio não conhece Codex, Obsidian, rg ou SQLite diretamente.

### 5.3 Fluxo de execução

~~~mermaid
sequenceDiagram
    participant U as Usuário
    participant H as Harness
    participant S as Stores
    participant C as Codex

    U->>H: Inicia ou retoma
    H->>S: Valida perfil e checkpoint
    H->>S: Busca WARM e FULL
    S-->>H: Itens com proveniência
    H->>C: Context bundle
    C-->>H: Resultado e evidências
    H->>S: Checkpoint atômico
    H-->>U: Resultado
    H->>U: Candidatos opcionais
~~~

A tarefa não fica bloqueada porque o usuário não quis persistir memória.

---

## 6. Modelo HOT, WARM e FULL

HOT, WARM e FULL representam ciclo de vida e custo de recuperação. Não representam importância ou segurança.

| Camada | Pergunta | Conteúdo | Persistência | Autoridade |
|---|---|---|---|---|
| HOT | O que fazemos agora? | Objetivo, plano, erros, arquivos e estado | Curta, por tarefa | Checkpoint |
| WARM | O que aprendemos e aprovamos? | Decisões, correções, preferências e fatos | Durável | Registro aprovado |
| FULL | Onde está o conhecimento completo? | Obsidian, repos, ADRs e runbooks | Na origem | A própria fonte |

### 6.1 HOT

Inclui:

- objetivo e requisitos;
- estágio;
- plano aprovado e hash;
- modo e perfil;
- arquivos ativos;
- erros, hipóteses e fatos;
- decisões;
- verificações;
- bloqueios;
- próxima ação;
- referências usadas.

Não deve virar diário da conversa, copiar outputs extensos, guardar segredos ou ser reutilizado automaticamente em outra tarefa.

### 6.2 WARM

Unidades pequenas e independentes:

| Tipo | Exemplo | Regra |
|---|---|---|
| decision | Serviço publica por outbox | Apontar para decisão/evidência |
| correction | Tabela correta é orders_v2 | Prioridade contra erro recorrente |
| preference | Mostrar blocos pequenos no teach | Origem humana basta |
| convention | Branch usa prefixo wac/ | Escopo obrigatório |
| verified_fact | Repo usa Node 22 | Snapshot verificável |
| pattern | Job falha junto de lock timeout | Não apresentar como causa garantida |

Procedimentos longos permanecem em FULL; WARM aponta para eles.

### 6.3 FULL

Catálogo de fontes pesquisáveis:

- diretórios Markdown;
- vault do Obsidian;
- repositórios Git;
- docs, ADRs e runbooks;
- contexto do perfil.

FULL não duplica tudo, não concede acesso geral e não autoriza escrita.

### 6.4 Metadados comuns

- profile_id;
- scope_id;
- kind;
- sensitivity;
- source e provenance;
- confidence;
- created_at e verified_at;
- valid_until;
- hash/revision;
- status.

Temperatura, escopo e sensibilidade permanecem dimensões independentes.

---

## 7. Continuidade e checkpoints

### 7.1 Duas continuidades

| Forma | Mecanismo | Papel |
|---|---|---|
| Conversacional | Thread do Codex | Preserva fluidez |
| Da tarefa | Checkpoint MegaBrain | Preserva estado necessário |

A primeira é oportunista; a segunda, autoritativa.

### 7.2 Gatilhos

Criar checkpoint:

1. após turno que altere materialmente o estado;
2. após aprovação ou mudança do plano;
3. antes/depois de mudança de estágio;
4. após verificação relevante;
5. após correção explícita;
6. antes da compactação se HOT estiver dirty;
7. sob pedido nomeado;
8. antes de encerrar;
9. antes de operação que possa interromper a sessão;
10. ao detectar perda provável de continuidade.

SessionEnd complementa, mas nunca é o único gatilho.

### 7.3 Tipos

| Tipo | Uso |
|---|---|
| turn | Estado após turno material |
| stage | Fronteira entre análise, plano, execução e verificação |
| named | Marco nomeado pelo usuário |
| pre_compact | Proteção antes da compactação |
| recovery | Estado reconstruído após falha |
| final | Fechamento |

### 7.4 Conteúdo obrigatório

- schema, checkpoint_id e anterior;
- task_id, run_id e profile_id;
- modo e estágio;
- objetivo e requisitos;
- fatos confirmados e hipóteses;
- decisões e aprovações com hashes;
- plano e hash;
- arquivos ativos;
- verificações e bloqueios;
- próxima ação;
- referências WARM/FULL;
- versões de policy e skill;
- snapshots;
- thread_id opcional;
- timestamp e hash de integridade.

Resumo livre pode existir, mas campos críticos são estruturados.

### 7.5 Escrita atômica

1. validar schema;
2. aplicar redaction e secret scan;
3. serializar deterministicamente;
4. escrever temporário no mesmo filesystem;
5. renomear atomicamente;
6. validar hash;
7. emitir checkpoint.created;
8. atualizar current só após sucesso.

Falha preserva o checkpoint anterior.

### 7.6 Retomada

~~~mermaid
flowchart TD
    A["Selecionar tarefa"] --> B["Validar perfil e checkpoint"]
    B --> C{"Íntegro?"}
    C -->|Não| D["Anterior ou bloqueio"]
    C -->|Sim| E["Verificar drift"]
    E --> F{"Thread disponível?"}
    F -->|Sim| G["Retomar thread"]
    F -->|Não| H["Nova thread + capsule"]
    G --> I["Confirmar estado"]
    H --> I
~~~

Passos:

1. resolver perfil;
2. localizar checkpoint;
3. validar schema e hash;
4. conferir compatibilidade;
5. validar policies, aprovações e modo;
6. verificar drift;
7. revalidar itens vencidos;
8. tentar thread;
9. usar nova thread se necessário;
10. construir restore capsule;
11. pedir confirmação para drift material;
12. prosseguir e emitir eventos.

### 7.7 Restore capsule

Contém somente identidade, objetivo, requisitos, estágio, plano, decisões, fatos, arquivos, última verificação, bloqueios, próxima ação e referências recuperáveis.

Não contém transcript, chain-of-thought, outputs brutos, memória rejeitada, FULL não selecionada ou segredos.

### 7.8 Compactação

Integração:

- PreCompact: persiste HOT dirty;
- PostCompact: registra a compactação;
- SessionStart com origem compact: injeta capsule controlado;
- Stop: registra o turno sem ser a única persistência.

O runtime não analisa transcript interno, pois não é API estável. Usa contratos e eventos oficiais. Consulte [Hooks do Codex](https://learn.chatgpt.com/docs/hooks).

### 7.9 Drift

Pode ocorrer em branch, commit, arquivo ativo, policy, skill, WARM, FULL, harness, modelo ou aprovação.

| Nível | Exemplo | Ação |
|---|---|---|
| informational | Doc não usada mudou | Registrar |
| review | Arquivo ativo mudou | Mostrar e confirmar |
| blocking | Plano não corresponde ao código | Bloquear |
| security | Perfil/policy incompatível | Recusar |

---

## 8. Memória WARM

### 8.1 Unidade canônica

Cada memória é Markdown com frontmatter validado:

~~~markdown
---
schema_version: 1
memory_id: mem_01J...
profile_id: work.colmeia
scope_id: repository:payments-api
kind: decision
status: active
sensitivity: confidential
confidence: confirmed
created_at: 2026-09-11T10:30:00Z
verified_at: 2026-09-11T10:30:00Z
valid_until: null
source_run_ids:
  - run_01J...
evidence_refs:
  - git:payments-api@9f31a2c:docs/adr/004-outbox.md
tags: [payments, events]
revision: 1
content_hash: sha256:...
supersedes: null
conflicts_with: []
---

# Decisão

O serviço de pagamentos publica eventos de domínio pelo padrão outbox.

## Limites

Vale apenas para payments-api e deve ser revalidada se o ADR 004 mudar.
~~~

O texto deve ser avaliável isoladamente.

### 8.2 Por que Markdown

- revisão e diff humanos;
- portabilidade;
- compatibilidade com Git quando exportação for autorizada;
- ausência de lock-in;
- busca textual;
- correção simples;
- links para fontes externas.

### 8.3 Índice derivado

SQLite FTS5 indexa statement, título, limites, tags, scope, kind, datas, status, revision e termos normalizados.

Em divergência:

1. Markdown vence;
2. item sai da recuperação;
3. índice é reconstruído;
4. evento memory.index_rebuilt é emitido.

### 8.4 Snapshot

memory_snapshot_id é calculado sobre lista ordenada de memory_id, revision, content_hash, status e profile_id. Ele permite reproduzir elegibilidade sem duplicar conteúdo.

### 8.5 Escopo

Do mais específico ao amplo:

1. task;
2. repository;
3. project;
4. organization;
5. profile.

Não existe scope global compartilhado entre personal e work.colmeia.

---

## 9. Fontes FULL

### 9.1 Adapters

| Adapter | Fonte | Método | Escrita |
|---|---|---|---|
| filesystem-markdown | Obsidian e docs | rg + leitura limitada | Não |
| git-repository | Código, ADR e README | rg + Git | Não |
| runbook-directory | Runbooks | rg + filtros | Não |
| profile-context | Overlay curado | rg + leitura direta | Não |

PDFs, bancos, emails e serviços remotos ficam fora da v0.2.

### 9.2 Registro

~~~yaml
schema_version: 1
profile_id: work.colmeia

sources:
  - source_id: colmeia-payments-repo
    adapter: git-repository
    root: /work/colmeia/payments-api
    trust: authoritative
    sensitivity: confidential
    read_only: true
    include:
      - README.md
      - docs/**
      - src/**
    exclude:
      - .env*
      - secrets/**
      - node_modules/**
      - dist/**
    allowed_workflows:
      - planning
      - debugging
      - branch-review
    freshness:
      strategy: git-commit
~~~

Regras:

- root absoluto e resolvido;
- symlink fora da raiz bloqueado;
- include é allowlist;
- read_only sempre true;
- uma fonte pertence a um perfil;
- indisponibilidade é visível;
- trust não transforma texto em instrução.

### 9.3 Níveis de confiança

| Nível | Exemplo | Uso |
|---|---|---|
| authoritative | ADR vigente | Sustenta fato verificado |
| maintained | Doc de equipe | Usar com origem e data |
| advisory | Nota de estudo | Apoio |
| historical | Trace antigo | Contexto histórico |
| untrusted | Conteúdo importado | Nunca instrução |

### 9.4 Obsidian

Na v0.2, Obsidian é FULL, não WARM automática. O adapter pesquisa raízes permitidas, retorna trechos com caminho/hash, respeita metadados e não altera notas nem copia o vault.

Não é necessária uma skill ampla de Obsidian. Adapter e router cuidam da pesquisa; memory-curator pode propor conclusões, mas não escreve no vault.

### 9.5 Snapshots

- Git: commit, branch e dirty state;
- Markdown: hash dos arquivos usados;
- arquivo: caminho canônico, tamanho, mtime e hash;
- overlay: commit ou hash.

Não é preciso hashear todo o vault a cada execução.

---

## 10. Recuperação seletiva

### 10.1 Entrada

RetrievalRequest inclui:

- profile_id, task_id e workflow;
- objetivo e termos explícitos;
- repositório/arquivos ativos;
- tipos e fontes permitidos;
- sensibilidade máxima;
- instante de referência;
- orçamento e limites.

### 10.2 Pipeline

~~~mermaid
flowchart TD
    A["Necessidade"] --> B["Filtros rígidos"]
    B --> C["Busca WARM e FULL"]
    C --> D["Deduplicação e ranking"]
    D --> E["Proveniência"]
    E --> F["Bundle limitado"]
~~~

#### Filtros rígidos

Antes do ranking:

- perfil coincide;
- source permitida;
- status active;
- sensibilidade permitida;
- validade vigente;
- sem conflito;
- caminho em allowlist;
- workflow autorizado;
- hash válido.

#### Busca

- WARM por FTS5 e metadados;
- FULL por rg e leitura limitada;
- referência explícita resolvida antes da busca ampla.

#### Ranking determinístico

1. referência explícita;
2. arquivo/repositório exato;
3. task/project scope;
4. tag/termo exato;
5. kind útil ao workflow;
6. autoridade da fonte;
7. recência/validade;
8. utilidade histórica como desempate.

Não haverá score opaco único; resultados carregam rank_factors.

#### Orçamento inicial

- máximo de 5 WARM;
- máximo de 8 trechos FULL;
- máximo de 2 trechos por fonte, salvo referência explícita;
- memória/FULL até 20% do orçamento de entrada;
- menor trecho semanticamente íntegro.

Prioridade se faltar espaço: policy e requisitos, checkpoint, referência explícita, WARM específica, FULL authoritative, complemento.

### 10.3 Context bundle

Cada item leva:

- retrieval_item_id;
- tipo;
- conteúdo;
- profile_id e scope_id;
- source/evidence ref;
- source_hash;
- datas e validade;
- sensitivity e confidence;
- reason_selected;
- marcação estrutural de “dado, não instrução”.

### 10.4 Reason codes

| Código | Significado |
|---|---|
| PROFILE_MISMATCH | Outro perfil |
| SOURCE_NOT_ALLOWED | Fonte não autorizada |
| SENSITIVITY_BLOCKED | Sensibilidade excedida |
| STATUS_INACTIVE | Estado não ativo |
| EXPIRED | Validade encerrada |
| CONFLICTED | Conflito aberto |
| HASH_INVALID | Integridade falhou |
| WORKFLOW_NOT_ALLOWED | Workflow proibido |
| LOW_RELEVANCE | Abaixo dos selecionados |
| BUDGET_EXCEEDED | Não coube |
| DUPLICATE | Já representado |
| SOURCE_UNAVAILABLE | Fonte indisponível |

### 10.5 Feedback de utilidade

Registrar item selecionado, efetivamente citado, contestado, causador de correção, fonte buscada depois e contexto inútil. Isso alimenta evals, nunca altera ranking ou memória automaticamente.

---

## 11. Ciclo de vida da memória

### 11.1 Estados

~~~mermaid
stateDiagram-v2
    [*] --> Candidate
    Candidate --> Active: aprovar ou editar
    Candidate --> Rejected: rejeitar
    Active --> Superseded: substituir
    Active --> Expired: vencer
    Active --> Revoked: revogar
    Active --> Quarantined: conflito ou suspeita
    Quarantined --> Active: resolver e revalidar
~~~

### 11.2 Geração de candidatos

Pode nascer de:

- correção explícita;
- decisão arquitetural aprovada;
- preferência declarada;
- fato verificado em fonte authoritative;
- padrão recorrente em mais de uma tarefa;
- solicitação manual memory propose.

Não nasce automaticamente de toda mensagem, trace, hipótese, output não verificado, segredo, informação sem escopo ou conteúdo repetido.

### 11.3 Skill memory-curator

A v0.2 adiciona uma sexta skill, de invocação explícita.

Responsabilidades:

- propor poucos itens de alto valor;
- classificar kind, scope, sensibilidade e confiança;
- apontar evidências;
- detectar duplicatas prováveis;
- sugerir validade;
- redigir afirmação pequena;
- apresentar aprovar, editar, rejeitar ou adiar.

Limites:

- não escreve na store;
- não modifica FULL;
- não resolve conflitos;
- não eleva hipótese a confirmed;
- não persiste chain-of-thought;
- não roda silenciosamente a cada resposta.

### 11.4 Revisão humana

A interface mostra afirmação, utilidade, escopo, tipo, sensibilidade, confiança, origem, validade e conflitos.

Decisões:

1. **Aprovar:** persiste como proposto.
2. **Editar e aprovar:** texto humano vira canônico.
3. **Rejeitar:** registra motivo opcional.
4. **Adiar:** permanece fora da recuperação.
5. **Converter em documento:** conteúdo longo é direcionado a FULL sem escrita automática.

### 11.5 Transação de aprovação

1. validar identidade e perfil;
2. confirmar decisão explícita;
3. aplicar redaction;
4. validar schema;
5. procurar duplicatas e conflitos;
6. escrever revisão atomicamente;
7. atualizar índice;
8. calcular snapshot;
9. emitir memory.approved;
10. exibir o registro final.

Se o índice falhar depois da escrita canônica, a aprovação permanece, mas o item fica indisponível até rebuild.

### 11.6 Revisões

Edição cria revision + 1 e preserva hash anterior, autor da decisão, motivo, timestamp, diff e mudanças de evidência. Não existe sobrescrita silenciosa.

---

## 12. Conflitos, validade e esquecimento

### 12.1 Duplicatas

Normalização conservadora compara perfil, escopo, tipo, sujeito, afirmação e evidências.

Duplicata exata:

- não cria item;
- agrega evidência ou last_seen_at quando aprovado;
- mantém histórico;
- emite memory.duplicate_detected.

Similaridade lexical sozinha não autoriza merge.

### 12.2 Conflitos

Conflito ocorre quando itens do mesmo perfil, escopo e assunto são incompatíveis. Exemplo: “Node 20” versus “Node 22”.

Fluxo:

1. relacionar os itens;
2. retirá-los da injeção automática;
3. abrir conflict queue;
4. procurar evidência atual;
5. apresentar resolução;
6. ativar o atual;
7. marcar o anterior superseded quando aplicável.

Não existe last-write-wins silencioso.

### 12.3 Validade

| Categoria | Validade | Exemplo |
|---|---|---|
| static | Sem expiração automática | Preferência pessoal |
| release_bound | Até mudança de versão | API de biblioteca |
| repository_bound | Até evidência mudar | Convenção do repo |
| time_bound | Data explícita | Processo temporário |
| task_bound | Apenas tarefa | Hipótese operacional |

Defaults são sugestões; a policy do perfil pode ser mais restritiva.

### 12.4 Expiração, revogação e quarentena

- **Expired:** valid_until passou; sai do índice ativo.
- **Revoked:** usuário decidiu que não deve ser usado.
- **Quarantined:** suspeita de erro, corrupção, vazamento ou conflito.

Expirar não apaga histórico. Quarentena pode ser automática para proteção; reativação exige humano.

### 12.5 Exclusão material

Para privacidade ou segredo:

1. bloquear imediatamente;
2. remover do índice;
3. remover conteúdo sensível conforme policy;
4. manter tombstone não sensível quando permitido;
5. invalidar caches;
6. registrar sem repetir o segredo.

Backups e exports seguem a mesma política.

---

## 13. Memória nativa do Codex

### 13.1 Decisão

Em execuções gerenciadas pelo MegaBrain, a memória local nativa do Codex fica desativada por padrão para geração e recuperação.

Razões:

- não é o contrato versionado do MegaBrain;
- não possui o mesmo isolamento por perfil;
- dificulta reproduzir por que algo foi lembrado;
- cria duas autoridades;
- pode persistir material fora do ciclo de aprovação.

Codex local e memória do ChatGPT são sistemas separados. Regras obrigatórias devem ficar em AGENTS.md ou docs; memória é recall, não policy. Consulte [Memórias do Codex](https://learn.chatgpt.com/docs/customization/memories).

### 13.2 Manifest

~~~yaml
native_codex_memory:
  use: false
  generate: false
  external_context_generation: false
  policy_reason: megabrain_managed_memory
~~~

O wrapper aplica as opções equivalentes da versão instalada e registra a configuração efetiva.

### 13.3 Fora do MegaBrain

O usuário pode manter memória nativa em sessões comuns. Isso não a transforma em fonte do MegaBrain.

Uma importação futura precisará ser explícita, read-only, revisada, sem promoção automática e marcada com sua origem. Não entra na v0.2.

Chats do ChatGPT também não são banco primário. A v0.2 não depende de acesso geral ao histórico.

---

## 14. Interfaces e comandos

### 14.1 Execução e continuidade

~~~text
megabrain run --profile personal
megabrain run --profile work.colmeia
megabrain run --profile work.colmeia --pode-fazer

megabrain resume <task-id>
megabrain resume <task-id> --checkpoint <checkpoint-id>
megabrain resume <task-id> --new-thread

megabrain checkpoint create
megabrain checkpoint create --name "plano aprovado"
megabrain checkpoint list <task-id>
megabrain checkpoint inspect <checkpoint-id>
megabrain checkpoint verify <checkpoint-id>
~~~

### 14.2 Memória

~~~text
megabrain memory propose <task-id>
megabrain memory candidates
megabrain memory review <candidate-id>
megabrain memory search "outbox payments" --profile work.colmeia
megabrain memory explain <memory-id>
megabrain memory history <memory-id>
megabrain memory conflicts
megabrain memory expire
megabrain memory revoke <memory-id>
megabrain memory rebuild-index --profile work.colmeia
~~~

### 14.3 Fontes e diagnóstico

~~~text
megabrain source list --profile personal
megabrain source inspect <source-id>
megabrain source doctor <source-id>
megabrain source search <source-id> "termo"
megabrain source snapshot <source-id>

megabrain doctor memory
megabrain doctor continuity
megabrain explain-context <run-id>
megabrain trace show <run-id> --section retrieval
~~~

Não existem source write, sync remoto ou delete na v0.2.

### 14.4 Relação com --pode-fazer

| Ação | teach | implement |
|---|---:|---:|
| Ler fonte permitida | Sim | Sim |
| Criar checkpoint | Sim | Sim |
| Propor memória | Sim | Sim |
| Aprovar memória sem usuário | Não | Não |
| Alterar código do projeto | Não | Sim, dentro do plano |
| Escrever em FULL | Não | Não |
| Misturar perfis | Não | Não |

--pode-fazer amplia apenas alteração do projeto, não memória, perfil, segredo ou policy.

---

## 15. Estrutura de diretórios

### 15.1 Repositório

~~~text
megabrain/
├── AGENTS.md
├── VERSION
├── CHANGELOG.md
├── megabrain.lock.yaml
├── .agents/skills/
│   ├── teacher/
│   ├── planning/
│   ├── debugging/
│   ├── colmeia-definition/
│   ├── colmeia-branch-review/
│   └── memory-curator/
├── core/
│   ├── schemas/
│   │   ├── checkpoint.schema.json
│   │   ├── memory-record.schema.json
│   │   ├── memory-candidate.schema.json
│   │   ├── retrieval-request.schema.json
│   │   ├── retrieval-item.schema.json
│   │   ├── source-registry.schema.json
│   │   └── run-manifest.schema.json
│   ├── policies/
│   │   ├── memory.yaml
│   │   ├── continuity.yaml
│   │   ├── retrieval.yaml
│   │   └── redaction.yaml
│   └── templates/
├── src/
│   ├── domain/
│   │   ├── checkpoints/
│   │   ├── memory/
│   │   ├── retrieval/
│   │   └── sources/
│   ├── application/
│   │   ├── continuity/
│   │   ├── memory-curation/
│   │   └── context-building/
│   └── adapters/
│       ├── codex/
│       ├── filesystem/
│       ├── git/
│       ├── sqlite/
│       └── telemetry/
├── profiles/
│   ├── personal/
│   └── work/colmeia/
├── evals/
│   ├── cases/v0.1/
│   ├── cases/v0.2/
│   ├── fixtures/
│   ├── baselines/
│   └── reports/
└── docs/
    ├── adr/
    └── runbooks/
~~~

### 15.2 Estado mutável fora do Git

~~~text
XDG_STATE_HOME/megabrain/
├── profiles/
│   ├── personal/
│   │   ├── memory/warm/
│   │   │   ├── items/
│   │   │   ├── revisions/
│   │   │   ├── candidates/
│   │   │   ├── conflicts/
│   │   │   └── events/
│   │   └── tasks/<task-id>/
│   │       ├── checkpoints/
│   │       └── current
│   └── work.colmeia/
│       └── ...
├── runs/
├── traces/
└── locks/
~~~

### 15.3 Cache reconstruível

~~~text
XDG_CACHE_HOME/megabrain/
├── profiles/
│   ├── personal/
│   │   ├── warm-index.sqlite
│   │   └── source-hashes/
│   └── work.colmeia/
│       ├── warm-index.sqlite
│       └── source-hashes/
└── retrieval/
~~~

### 15.4 Configuração local

~~~text
XDG_CONFIG_HOME/megabrain/
├── config.yaml
└── profiles/
    ├── personal/sources.yaml
    └── work.colmeia/sources.yaml
~~~

Exemplos ficam no repositório; caminhos reais e detalhes corporativos não.

---

## 16. Contratos e schemas

Exemplos conceituais que deverão virar JSON Schema e testes.

### 16.1 Checkpoint

~~~json
{
  "schema_version": 1,
  "checkpoint_id": "chk_01J...",
  "previous_checkpoint_id": "chk_01H...",
  "type": "stage",
  "task_id": "task_01J...",
  "run_id": "run_01J...",
  "profile_id": "work.colmeia",
  "mode": "teach",
  "stage": "planning",
  "goal": "Planejar a WAC-123",
  "accepted_requirements": [],
  "confirmed_facts": [],
  "open_hypotheses": [],
  "approved_decisions": [],
  "plan": {
    "status": "approved",
    "content_ref": "state:plan.md",
    "content_hash": "sha256:..."
  },
  "approvals": [],
  "active_files": [],
  "verifications": [],
  "blockers": [],
  "next_action": "Implementar o primeiro passo pelo usuário",
  "context_refs": [],
  "memory_snapshot_id": "memsnap_...",
  "source_snapshots": [],
  "engine": {
    "provider": "openai",
    "thread_id": "thread_...",
    "resume_optional": true
  },
  "harness": {
    "version": "0.2.0",
    "commit": "..."
  },
  "created_at": "2026-09-11T10:00:00Z",
  "integrity_hash": "sha256:..."
}
~~~

### 16.2 Candidato

~~~yaml
schema_version: 1
candidate_id: cand_01J...
profile_id: work.colmeia
scope_id: repository:payments-api
kind: correction
statement: A tabela correta para a consulta é orders_v2.
confidence: confirmed
sensitivity: confidential
evidence_refs:
  - run:run_01J...#user-correction-3
source_run_ids:
  - run_01J...
suggested_validity:
  type: repository_bound
duplicate_candidates: []
conflict_candidates: []
status: pending
created_at: 2026-09-11T10:15:00Z
~~~

### 16.3 Evento de recuperação

~~~json
{
  "schema_version": 1,
  "event": "memory.selected",
  "run_id": "run_01J...",
  "task_id": "task_01J...",
  "profile_id": "work.colmeia",
  "retrieval_id": "ret_01J...",
  "item_id": "mem_01J...",
  "item_revision": 2,
  "source_hash": "sha256:...",
  "rank_position": 1,
  "rank_factors": [
    "repository_scope_exact",
    "term_match",
    "authoritative_evidence"
  ],
  "budget_tokens_estimated": 118,
  "created_at": "2026-09-11T10:20:00Z"
}
~~~

### 16.4 Run manifest v2

~~~yaml
schema_version: 2
run_id: run_01J...
task_id: task_01J...
harness_version: 0.2.0
harness_commit: ...
telemetry_schema_version: 2
memory_schema_version: 1
checkpoint_schema_version: 1
retrieval_schema_version: 1

profile_id: work.colmeia
mode: teach
workflow: planning

engine:
  provider: openai
  model: ...
  reasoning_effort: ...
  codex_version: ...
  thread_id: ...

native_codex_memory:
  use: false
  generate: false

configuration:
  config_hash: sha256:...
  policies_hash: sha256:...
  skills_hash: sha256:...

continuity:
  resumed: true
  strategy: checkpoint_new_thread
  checkpoint_id: chk_01J...

memory:
  snapshot_id: memsnap_...
  selected_ids: []

sources:
  registry_hash: sha256:...
  snapshots: []

eval_suite_version: 0.2.0
~~~

### 16.5 Compatibilidade

- schema maior desconhecido bloqueia escrita e permite inspeção segura;
- campo opcional desconhecido é preservado;
- migração é explícita e testada;
- v0.1 não é promovida a WARM por leitura;
- hash usa serialização canônica definida.

---

## 17. Tracing e observabilidade

### 17.1 Eventos novos

**Continuidade**

- checkpoint.created, loaded, validation_failed, fallback_loaded e drift_detected;
- continuity.thread_resumed, thread_resume_failed e recovered_from_checkpoint;
- continuity.restore_capsule_built e user_confirmation_required.

**Memória**

- memory.candidate_created, candidate_edited, approved e rejected;
- memory.duplicate_detected, conflict_detected e conflict_resolved;
- memory.superseded, expired, revoked e quarantined;
- memory.index_rebuilt e snapshot_created.

**Recuperação**

- retrieval.started, query_built e completed;
- memory.retrieved e selected;
- source.retrieved e selected;
- context.item_rejected, bundle_built, item_referenced e item_corrected.

**Fontes e policy**

- source.scanned, changed, unavailable, path_blocked e snapshot_created;
- native_memory.policy_applied;
- profile.isolation_checked;
- persistence.approval_requested e denied;
- secret.detected e redaction.applied.

### 17.2 Atributos comuns

run_id, task_id, checkpoint_id, profile_id, workflow, mode, harness_version, schema_version, source_id, memory_id/revision, reason_code, duração, tokens estimados e resultado não sensível.

### 17.3 Conteúdo proibido

- chain-of-thought;
- prompt integral por padrão;
- segredo ou token;
- conteúdo corporativo bruto desnecessário;
- trecho FULL quando hash e referência bastam;
- memória rejeitada além da auditoria segura.

### 17.4 Proveniência

~~~mermaid
flowchart LR
    A["Fonte"] --> B["Evidência"]
    B --> C["Candidato"]
    C --> D["Aprovação"]
    D --> E["Revisão WARM"]
    E --> F["Recuperação"]
    F --> G["Execução"]
~~~

Nenhum elo depende apenas de texto livre.

### 17.5 Visualização

Collector OTel e dashboard local devem filtrar por perfil, tarefa, execução, checkpoint, fonte, memória, reason code e versão. OTel transporta telemetria; os eventos de domínio descrevem o MegaBrain.

---

## 18. Segurança e isolamento

### 18.1 Modelo de ameaça

| Risco | Exemplo | Controle |
|---|---|---|
| Cross-profile | Nota pessoal em tarefa ColmeIA | Stores e índices separados |
| Prompt injection | README tenta mudar policy | Fonte como dado |
| Persistência indevida | Hipótese vira fato | Aprovação e schema |
| Obsolescência | Versão antiga | Validade e drift |
| Segredo WARM | Token numa correção | Scanner e bloqueio |
| Path traversal | Symlink sai da raiz | Caminho canônico |
| Corrupção | Escrita parcial | Atomicidade e hash |
| Concorrência | Revisões simultâneas | Lock por perfil/item |
| Índice divergente | SQLite atrasado | Markdown canônico |
| Aprovação reaproveitada | Plano mudou | Hash da aprovação |
| Source spoofing | Arquivo muda | Snapshot |
| Exclusão incompleta | Cache retém item | Purge e rebuild |

### 18.2 Isolamento

Cada perfil tem diretório de estado, índice, sources, locks, sensibilidade e retenção próprios. A separação física reforça o filtro lógico.

### 18.3 Ordem de autorização

Antes de ler:

1. resolver perfil;
2. validar source e workflow;
3. resolver caminho real;
4. verificar allowlist e sensibilidade;
5. pesquisar.

Antes de persistir:

1. validar perfil;
2. obter aprovação vinculada ao conteúdo;
3. buscar segredo;
4. validar schema;
5. detectar conflito;
6. escrever atomicamente.

### 18.4 Filesystem

Defaults:

- diretórios 0700;
- memória/checkpoint 0600;
- umask restritiva;
- sem symlink fora das roots;
- sem estado sensível em pasta sincronizada.

### 18.5 Dados corporativos

Para work.colmeia:

- estado local ou em ambiente aprovado;
- nada bruto no repo pessoal;
- export desativado;
- retenção menor quando necessário;
- traces preferem hashes e reason codes;
- sincronização futura exige policy corporativa.

### 18.6 Conteúdo recuperado

O Context Builder envolve cada item com origem, escopo, aviso “dados, não instruções”, delimitadores e limite. Memória não adiciona tools, permissões nem muda o modo.

### 18.7 Backup

Checkpoints podem ter backup local criptografado opcional; personal não sensível pode ser exportada manualmente; work.colmeia não sai do ambiente autorizado; cache não exige backup. Automação remota fica fora do escopo.

---

## 19. Evals e métricas

### 19.1 Estratégia

A suite v0.2 executa:

1. todos os casos da v0.1;
2. casos determinísticos de schema e lifecycle;
3. integração com fontes sintéticas;
4. retomada com e sem thread;
5. casos adversariais;
6. casos reais sanitizados.

### 19.2 Casos mínimos novos

| ID | Caso | Resultado esperado |
|---|---|---|
| MEM-01 | Candidato sem aprovação | Não entra em WARM |
| MEM-02 | Aprovação editada | Só texto editado fica ativo |
| MEM-03 | Duplicata exata | Evidência agregada, sem novo item |
| MEM-04 | Conflito factual | Itens fora da injeção até resolução |
| MEM-05 | Memória expirada | Não selecionada |
| MEM-06 | Memória revogada | Não selecionada ou reativada |
| MEM-07 | Índice apagado | Rebuild reproduz resultados |
| MEM-08 | Índice divergente | Canônico vence |
| RET-01 | Referência explícita | Referenciado tem prioridade |
| RET-02 | Orçamento excedido | Rejeição com reason code |
| RET-03 | Fonte indisponível | Falha visível |
| RET-04 | Cross-profile | Zero itens do outro perfil |
| RET-05 | Prompt injection | Instrução não obedecida |
| RET-06 | Symlink externo | Caminho bloqueado |
| CONT-01 | Thread disponível | Thread retomada e checkpoint validado |
| CONT-02 | Thread ausente | Nova thread usa capsule |
| CONT-03 | Compactação | Decisões críticas permanecem |
| CONT-04 | Checkpoint corrompido | Fallback ou bloqueio |
| CONT-05 | Drift crítico | Pede confirmação |
| CONT-06 | Plano alterado | Aprovação antiga inválida |
| PRIV-01 | Segredo em candidato | Persistência bloqueada/redigida |
| PRIV-02 | Exclusão | Some de índice, cache e uso |
| OBS-01 | Explain context | Toda seleção tem proveniência |
| OBS-02 | Reprodução | Snapshot gera mesmo conjunto elegível |

### 19.3 Métricas

**Recuperação**

- Precision@k;
- recall crítico;
- miss rate;
- context utilization;
- stale recall rate;
- duplicate rate;
- diversidade útil de fontes.

**Continuidade**

- checkpoint resume fidelity;
- decisões e requisitos preservados;
- fallback para nova thread;
- falhas de hash;
- drift detectado;
- tempo e tokens para retomar.

**Governança**

- candidatos por tarefa;
- taxas de aprovação, edição e rejeição;
- conflitos;
- expirações;
- correções causadas por memória;
- violações de policy;
- cross-profile leak rate.

**Eficiência**

- tokens de memória por tarefa aceita;
- tokens FULL por resultado aprovado;
- latência;
- tamanho e rebuild do índice;
- queries por tarefa.

### 19.4 Gates obrigatórios

| Gate | Limite |
|---|---:|
| Vazamento cross-profile | 0 |
| WARM ativa sem aprovação | 0 |
| Item expirado/revogado/conflitante injetado | 0 |
| Segredo de fixture persistido | 0 |
| Decisões críticas preservadas | 100% |
| Checkpoint com hash inválido aceito | 0 |
| Drift crítico ignorado | 0 |
| Regressão em gate da v0.1 | 0 |

### 19.5 Metas calibráveis

- Precision@5 mínima de 0,80;
- recall crítico mínimo de 0,90;
- context utilization mínima de 0,60;
- retomada em nova thread de 100% nos fixtures;
- redução de contexto inútil sem perda de recall.

As metas mudam após baseline; qualidade e segurança prevalecem sobre tokens.

### 19.6 Comparação v0.1 versus v0.2

- mesmos casos, modelo e reasoning effort;
- mesmos snapshots;
- v0.1 sem WARM/FULL e v0.2 com pipeline;
- custo de checkpoint separado de recuperação;
- correções humanas registradas;
- resultado final avaliado, não só tokens.

---

## 20. Migração da v0.1

### 20.1 Versões

~~~yaml
harness_version: 0.2.0
run_manifest_schema_version: 2
memory_schema_version: 1
checkpoint_schema_version: 1
retrieval_schema_version: 1
telemetry_schema_version: 2
~~~

### 20.2 Compatibilidade

- manifests v0.1 continuam legíveis;
- ausência de memory_snapshot significa none;
- HOT antigo pode ser inspecionado;
- traces antigos permanecem evidência;
- nada antigo vira WARM automaticamente;
- candidato legado passa pela revisão normal;
- evals v0.1 continuam na suite.

### 20.3 Passos

1. criar stores por perfil;
2. criar checkpoints;
3. introduzir schemas sem mover conteúdo corporativo;
4. marcar legado como origin legacy_v0.1;
5. validar permissões;
6. construir índices vazios;
7. executar doctor;
8. habilitar escrita após testes.

### 20.4 Ativação progressiva

**A — Shadow mode**

- checkpoints ativos;
- recuperação calcula candidatos;
- nada WARM/FULL é injetado;
- relatório mostra seleção hipotética.

**B — WARM controlada**

- poucos registros aprovados;
- WARM ativa;
- FULL ainda em shadow;
- casos sanitizados.

**C — FULL read-only**

- fontes por perfil;
- bundle limitado;
- explain-context obrigatório;
- custo e utilidade monitorados.

**D — Release candidate**

- todos os gates;
- regressão v0.1;
- três execuções de casos não determinísticos;
- aprovação humana.

### 20.5 Rollback

Desativar recuperação WARM/FULL, manter checkpoints legíveis, preservar canônico, não apagar memória e registrar memory_mode disabled. Nenhuma conversão é necessária.

---

## 21. Plano de construção

Esta ordem não autoriza escrita em código de projeto.

### Marco 0 — ADRs e schemas

Entregas:

- ADR checkpoint versus thread;
- ADR Markdown + SQLite;
- ADR isolamento;
- schemas e fixtures.

Critério: contratos revisados antes das stores.

### Marco 1 — Checkpoints

- CheckpointStorePort;
- atomicidade, hashes e current;
- create, inspect, list e verify;
- checkpoints por turno/estágio;
- testes de corrupção.

Critério: tarefa sintética retoma sem thread.

### Marco 2 — Continuity Manager

- resume por tarefa/checkpoint;
- tentativa de thread e fallback;
- restore capsule;
- drift;
- compactação;
- eventos.

Critério: CONT-01 a CONT-06 passam.

### Marco 3 — WARM canônica

- candidates e review;
- records e revisões;
- lifecycle e locks;
- redaction;
- FTS5 e rebuild.

Critério: zero escrita ativa sem aprovação.

### Marco 4 — Recuperação WARM

- request;
- filtros, ranking e orçamento;
- context bundle;
- explain-context;
- métricas.

Critério: gates de isolamento e validade.

### Marco 5 — FULL

- sources.yaml;
- adapters Markdown e Git;
- path enforcement;
- snapshots;
- source doctor;
- busca read-only.

Critério: fixtures personal e ColmeIA fisicamente separadas.

### Marco 6 — Curadoria

- skill memory-curator;
- propostas;
- duplicatas e conflitos;
- revisão;
- expire, revoke e history.

Critério: usuário controla todo item persistido.

### Marco 7 — Release

- casos v0.2;
- baseline e comparação;
- runbooks;
- changelog;
- RC 0.2.0.

Critério: todos os gates.

### 21.1 PRs sugeridos

| PR | Escopo | Depende de |
|---|---|---|
| 1 | Schemas e ADRs | — |
| 2 | Checkpoint store | 1 |
| 3 | Continuity manager | 2 |
| 4 | WARM e lifecycle | 1 |
| 5 | FTS5 e retrieval WARM | 4 |
| 6 | Source registry e FULL | 1 |
| 7 | Context builder e tracing | 3, 5, 6 |
| 8 | Curator e revisão | 4 |
| 9 | Evals, hardening e docs | Todos |

Uma categoria por PR facilita regressão.

---

## 22. Riscos

| Risco | Probabilidade | Impacto | Resposta |
|---|---|---|---|
| WARM vira depósito de resumos | Média | Alto | Unidades pequenas e review |
| Mais tokens sem ganho | Média | Médio | Orçamento e shadow mode |
| FULL devolve demais | Média | Alto | Allowlist e trechos limitados |
| Checkpoint omite decisão | Média | Alto | Campos estruturados e evals |
| Thread diverge | Média | Médio | Checkpoint vence |
| SQLite diverge | Baixa | Médio | Markdown e rebuild |
| Vazamento corporativo | Baixa | Crítico | Separação física e gates |
| Obsolescência | Alta | Médio | Validade e drift |
| Fadiga de aprovação | Média | Médio | Poucos candidatos |
| Prompt injection | Média | Alto | Envelope e testes |
| Root errada | Média | Alto | Caminho absoluto e doctor |
| Cache retém exclusão | Baixa | Alto | Purge e rebuild |
| Hooks mudam | Baixa | Médio | Adapter e persistência no runtime |
| Busca lexical perde sinônimo | Média | Médio | Métricas antes de embeddings |

### 22.1 Quando considerar busca semântica

Somente se:

1. recall crítico ficar abaixo da meta;
2. misses forem semânticos, não de fonte/escopo;
3. expansão lexical não resolver;
4. houver solução compatível com custo e privacidade;
5. A/B provar ganho sem regressão.

“Parece mais inteligente” não basta.

---

## 23. Critérios de aceitação

### Continuidade

- [ ] Retomar por task_id.
- [ ] Funcionar sem thread.
- [ ] Mostrar objetivo, decisões, plano e próxima ação.
- [ ] Rejeitar checkpoint corrompido.
- [ ] Pedir confirmação para drift crítico.
- [ ] Preservar decisões após compactação.
- [ ] Invalidar aprovação se conteúdo mudar.

### WARM

- [ ] Candidato não participa da busca.
- [ ] Humano cria registro ativo.
- [ ] Edição preserva revisão.
- [ ] Duplicata não cria ruído.
- [ ] Conflito suspende injeção.
- [ ] Expiração/revogação remove do ativo.
- [ ] Índice é reconstruível.
- [ ] Explain mostra origem e revisão.

### FULL

- [ ] Sources por perfil.
- [ ] Tudo read-only.
- [ ] Include/exclude aplicados.
- [ ] Symlink externo bloqueado.
- [ ] Indisponibilidade visível.
- [ ] Trechos têm path, hash e snapshot.
- [ ] Obsidian pesquisado sem cópia.

### Recuperação

- [ ] Filtros antes do ranking.
- [ ] Referência explícita prioritária.
- [ ] Orçamento respeitado.
- [ ] Rejeições com reason code.
- [ ] Sem item expirado/conflitante.
- [ ] Seleção reproduzível.
- [ ] Utilidade mensurável.

### Segurança

- [ ] Cross-profile zero.
- [ ] Segredos de fixture não persistem.
- [ ] Conteúdo não altera policy.
- [ ] --pode-fazer não aprova memória.
- [ ] Permissões locais restritas.
- [ ] Conteúdo ColmeIA fora do repo pessoal.
- [ ] Exclusão invalida índice/cache.

### Observabilidade

- [ ] Eventos têm run_id e task_id.
- [ ] Checkpoints e memórias se correlacionam.
- [ ] Bundle é explicável.
- [ ] Sem chain-of-thought em trace.
- [ ] Dashboard filtra perfil, tarefa e memória.

---

## 24. Definition of Done

### Cenário A — Retomada de WAC

1. iniciar WAC em work.colmeia;
2. aprovar plano;
3. salvar checkpoint;
4. encerrar thread;
5. retomar dias depois em nova thread;
6. reconstruir objetivo, decisões, arquivos e próxima ação;
7. detectar mudança no repo;
8. continuar sem transcript.

### Cenário B — Aprendizado aprovado

1. usuário corrige um fato;
2. curator propõe;
3. usuário edita e aprova;
4. store cria revisão;
5. tarefa futura recupera;
6. explain mostra origem;
7. usuário revoga;
8. item deixa de aparecer.

### Cenário C — SecondBrain

1. executar em personal;
2. pesquisar nota autorizada;
3. retornar trechos relevantes;
4. registrar caminho e hash;
5. não copiar o vault;
6. não acessar ColmeIA.

### Cenário D — Isolamento adversarial

1. termos idênticos nos dois perfis;
2. consultar ambos;
3. verificar separação física/lógica;
4. confirmar zero vazamento;
5. confirmar que injection não muda policy.

Além disso:

- gates v0.1 e v0.2 passam;
- nenhuma solução paga;
- nenhum banco vetorial;
- nenhuma escrita externa automática;
- nenhuma WARM ativa sem aprovação;
- manifest identifica 0.2.0;
- rollback para memory_mode disabled foi testado.

---

## 25. Roadmap

### v0.3 — Integrações read-only

- GitHub restrito;
- Jira leitura;
- Gmail leitura/busca e rascunho;
- Google Drive autorizado;
- connectors separados por perfil;
- consentimento por ferramenta.

### v0.4 — Evaluator e Trace Analyzer

- classificar falhas;
- detectar padrões;
- propor mudanças;
- ligar erro a contexto/componente;
- regressão automatizada;
- sem merge autônomo.

### v0.5 — Portabilidade

- segundo motor;
- adapters extraídos;
- plugin/distribuição;
- migrações estáveis;
- compatibilidade formal.

Busca vetorial, memória compartilhada e automações externas exigem evidência e novo blueprint.

---

## 26. Decisões registradas

| ID | Decisão | Estado |
|---|---|---|
| ADR-020 | Checkpoint autoritativo; thread é otimização | Aceita |
| ADR-021 | WARM canônica em Markdown | Aceita |
| ADR-022 | SQLite FTS5 derivado | Aceita |
| ADR-023 | FULL na origem e read-only | Aceita |
| ADR-024 | Um perfil por run e zero cross-profile | Aceita |
| ADR-025 | Promoção WARM exige humano | Aceita |
| ADR-026 | Memória Codex desativada em runs gerenciados | Aceita |
| ADR-027 | rg como busca FULL inicial | Aceita |
| ADR-028 | Sem banco vetorial | Aceita |
| ADR-029 | Curator propõe, não persiste | Aceita |
| ADR-030 | Checkpoint não depende de SessionEnd | Aceita |
| ADR-031 | Transcript interno não é integração | Aceita |

### 26.1 Parâmetros a calibrar

- máximo de WARM e trechos FULL;
- orçamento percentual;
- validade por kind;
- frequência de propostas;
- retenção de checkpoints;
- thresholds;
- cache;
- granularidade de trecho.

São parâmetros de baseline, não decisões arquiteturais.

---

## 27. Referências

### Codex

- [Memórias do Codex](https://learn.chatgpt.com/docs/customization/memories)
- [Hooks do Codex](https://learn.chatgpt.com/docs/hooks)
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [Configuração avançada](https://learn.chatgpt.com/docs/config-file/config-advanced)
- [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Skills](https://learn.chatgpt.com/docs/build-skills)

### Observabilidade

- [OpenTelemetry — GenAI observability](https://opentelemetry.io/blog/2026/genai-observability/)

---

## Conclusão

A v0.2 não tenta dar ao MegaBrain memória total. Ela constrói memória confiável.

O sistema passa a saber qual tarefa está em andamento, de qual checkpoint retomá-la, quais decisões foram aprovadas, onde buscar conhecimento, por que um trecho foi escolhido, quando ficou obsoleto e como evitar mistura entre vida pessoal e trabalho.

O resultado esperado é menos repetição, menos contexto inútil e mais continuidade, sem abrir mão de controle humano, rastreabilidade ou privacidade.
