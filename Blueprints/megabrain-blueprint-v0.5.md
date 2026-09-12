# MegaBrain — Blueprint v0.5

> **Codinome:** Controlled Candidate Pipeline
>
> **Versão do harness:** 0.5.0
>
> **Status:** pronto para planejamento de implementação
>
> **Data:** 2026-09-11
>
> **Herda:** MegaBrain Blueprints v0.1, v0.2, v0.3 e v0.4
>
> **Motor inicial:** Codex
>
> **Princípio:** aprovação para experimentar não é aprovação para integrar

---

## Índice

1. [Resumo executivo](#1-resumo-executivo)
2. [Relação com as versões anteriores](#2-relação-com-as-versões-anteriores)
3. [Decisão de escopo](#3-decisão-de-escopo)
4. [Objetivos e não objetivos](#4-objetivos-e-não-objetivos)
5. [Princípios e invariantes](#5-princípios-e-invariantes)
6. [Arquitetura da v0.5](#6-arquitetura-da-v05)
7. [Candidate Intake](#7-candidate-intake)
8. [Modelo de autorização](#8-modelo-de-autorização)
9. [Resolução da base](#9-resolução-da-base)
10. [Modelo de worktrees](#10-modelo-de-worktrees)
11. [Ambiente e setup reproduzível](#11-ambiente-e-setup-reproduzível)
12. [Change Plan](#12-change-plan)
13. [Candidate Builder](#13-candidate-builder)
14. [Scope Guard e orçamento de diff](#14-scope-guard-e-orçamento-de-diff)
15. [Regression-first](#15-regression-first)
16. [Candidate Snapshot e commits locais](#16-candidate-snapshot-e-commits-locais)
17. [Avaliação baseline versus candidate](#17-avaliação-baseline-versus-candidate)
18. [Code Review independente](#18-code-review-independente)
19. [Impact Report](#19-impact-report)
20. [Decisão humana](#20-decisão-humana)
21. [Rollback, descarte e cleanup](#21-rollback-descarte-e-cleanup)
22. [Segurança Git](#22-segurança-git)
23. [Perfis, privacidade e ColmeIA](#23-perfis-privacidade-e-colmeia)
24. [Interfaces e comandos](#24-interfaces-e-comandos)
25. [Estrutura de diretórios](#25-estrutura-de-diretórios)
26. [Contratos e schemas](#26-contratos-e-schemas)
27. [Tracing e observabilidade](#27-tracing-e-observabilidade)
28. [Métricas, evals e gates](#28-métricas-evals-e-gates)
29. [Falhas e resiliência](#29-falhas-e-resiliência)
30. [Migração da v0.4](#30-migração-da-v04)
31. [Plano de construção](#31-plano-de-construção)
32. [Riscos e respostas](#32-riscos-e-respostas)
33. [Critérios de aceitação](#33-critérios-de-aceitação)
34. [Definition of Done](#34-definition-of-done)
35. [Roadmap posterior](#35-roadmap-posterior)
36. [Decisões registradas](#36-decisões-registradas)
37. [Referências](#37-referências)

---

## 1. Resumo executivo

A v0.5 transforma uma Improvement Proposal aprovada em uma experiência de engenharia isolada, reproduzível e reversível.

A entrada é uma Proposal no estado ApprovedForCandidate, produzida pela v0.4. A saída é uma destas:

- candidate aceita para integração manual;
- candidate com mudanças solicitadas;
- candidate rejeitada;
- candidate inconclusiva;
- candidate bloqueada antes de editar.

O fluxo normativo é:

~~~mermaid
flowchart TD
    A["Proposal aprovada"] --> B["Autorização --pode-fazer"]
    B --> C["Baseline + candidate worktrees"]
    C --> D["Mudança mínima + regressão"]
    D --> E["Freeze local"]
    E --> F["Evals + code review"]
    F --> G["Impact Report"]
    G --> H{"Decisão humana"}
    H -->|"Aceitar"| I["Integração manual"]
    H -->|"Revisar"| J["Nova candidate revision"]
    H -->|"Rejeitar"| K["Preservar e limpar"]
~~~

A v0.5 introduz:

- Candidate Intake;
- Candidate Authorization;
- Base Resolver;
- Workspace Lease;
- Baseline Worktree;
- Candidate Worktree;
- Change Planner;
- Candidate Builder;
- Scope Guard;
- Candidate Snapshot;
- Regression Comparator;
- Independent Code Review;
- Impact Report;
- Human Decision Gate;
- Cleanup Manager.

O que muda em relação à v0.4:

- v0.4 observa, avalia, diagnostica e propõe;
- v0.5 materializa a proposta em isolamento e testa seu efeito;
- v0.5 não integra a mudança ao branch principal;
- v0.5 não escreve em remoto;
- v0.5 não transforma aprovação em merge.

Quatro aprovações permanecem conceitualmente separadas:

1. **ApprovedForCandidate:** vale a pena experimentar esta hipótese.
2. **--pode-fazer:** esta execução pode editar os paths autorizados.
3. **Freeze approval:** este change set pode virar snapshot/commit local para avaliação.
4. **AcceptedForManualIntegration:** o resultado é bom o suficiente para você integrar manualmente.

Nenhuma delas autoriza:

- push;
- pull request;
- merge;
- rebase;
- force push;
- escrita externa;
- alteração de memória;
- afrouxamento de policy.

### 1.1 Duas worktrees

A comparação justa usa dois ambientes derivados do mesmo base commit:

| Workspace | Conteúdo | Papel |
|---|---|---|
| baseline | Base commit sem a mudança | Medir comportamento anterior |
| candidate | Mesmo base commit mais change set | Medir comportamento proposto |

O checkout principal do usuário não é usado como laboratório e não é modificado.

### 1.2 Resultado esperado

A v0.5 precisa provar que o MegaBrain consegue melhorar uma parte do harness:

- sem tocar no trabalho em andamento do usuário;
- sem esconder o diff;
- sem ultrapassar o escopo da proposal;
- sem alterar expected answers para “fazer o teste passar”;
- sem regredir hard gates;
- sem misturar dados personal e work.colmeia;
- sem publicar nada;
- com descarte seguro.

---

## 2. Relação com as versões anteriores

### 2.1 Herança da v0.1

Permanece:

- Codex como primeiro motor;
- wrapper TypeScript como boundary;
- teach como modo padrão;
- planejamento antes de implementação;
- --pode-fazer para liberar edição;
- exatamente um profile por execução;
- router determinístico;
- skills sob demanda;
- verificação explícita;
- tracing;
- humano como autoridade final.

### 2.2 Herança da v0.2

Permanece:

- checkpoint é autoritativo;
- HOT é reconstruível;
- WARM é Markdown aprovado;
- FULL é consultada sob demanda;
- SQLite FTS5 é índice derivado;
- memória nativa do Codex desativada em runs gerenciados;
- promoção de memória exige curator/humano;
- trace não vira memória;
- personal e work.colmeia não se misturam.

### 2.3 Herança da v0.3

Permanece:

- integrations default deny;
- connector, conta, tenant e profile vinculados;
- --pode-fazer não concede permissão externa;
- GitHub/GitLab/Jira/Drive em leitura;
- Gmail draft é a única escrita externa possível e continua fora do pipeline candidate;
- push, merge, comment, transition, share, send e delete proibidos;
- credenciais fora do modelo;
- conteúdo externo não confiável;
- nenhuma fallback de conta.

### 2.4 Herança da v0.4

Permanece:

- Task Contract;
- Evidence Bundle;
- deterministic-first;
- hard gates não compensáveis;
- falta de evidência gera INCONCLUSIVE;
- Trace Analyzer produz hypotheses;
- Pattern exige independência;
- Proposal possui um target primário;
- ApprovedForCandidate não aplica nada;
- holdout não é exposto;
- model grader é opcional;
- qualidade precede tokens;
- evaluator possui self-evals.

### 2.5 Delta da v0.5

| Área | v0.4 | v0.5 |
|---|---|---|
| Proposal | Documento aprovado | Entrada de uma candidate |
| Experimento | Plano ou target existente | Candidate criada pelo pipeline |
| Workspace | Executa suite | Cria baseline e candidate worktrees |
| Alteração | Proibida | Permitida apenas na candidate |
| Autorização | ApprovedForCandidate | Proposal + --pode-fazer + scope |
| Snapshot | Target fornecido | Snapshot local imutável |
| Review | Avalia resultados | Revisa diff completo |
| Decisão | Aprovar para candidate | Aceitar para integração manual |
| Git remoto | Não usado | Continua não usado |
| Merge | Proibido | Continua proibido |

### 2.6 Separação de responsabilidades

~~~mermaid
flowchart LR
    A["v0.4: Proposal"] --> B["v0.5: Candidate"]
    B --> C["v0.5: Evidência"]
    C --> D["Humano"]
    D --> E["Integração manual"]
~~~

A v0.5 não reabre o diagnóstico automaticamente. Se a candidate contradiz a hipótese:

- registra o resultado;
- devolve evidência para a v0.4;
- marca Proposal como disproved ou needs_evidence;
- não improvisa outra mudança.

---

## 3. Decisão de escopo

### 3.1 Definição normativa

> **A v0.5 cria e avalia uma mudança candidata local, isolada e limitada por uma Proposal aprovada, encerrando antes de qualquer integração ou publicação.**

### 3.2 Unidade de trabalho

A unidade é uma Candidate, identificada por:

- candidate_id;
- proposal_id e version;
- candidate revision;
- profile_id;
- repository_id;
- base commit;
- branch local;
- baseline worktree;
- candidate worktree;
- authorization receipt;
- change plan;
- change set;
- snapshot;
- evaluation report;
- code review report;
- impact report;
- human decision.

### 3.3 Alvos suportados

| Target | v0.5 |
|---|---|
| skill | Sim |
| router | Sim |
| context builder | Sim |
| verifier | Sim |
| evaluator/grader | Sim |
| tool adapter local | Sim |
| policy mais restritiva | Sim, com security gates |
| documentação/runbook | Sim |
| eval suite | Sim |
| memória WARM | Não; memory-curator |
| connector permission | Não |
| external write capability | Não |
| policy mais permissiva | Bloqueada por padrão |
| modelo/fine-tuning | Não |

### 3.4 Um repositório por Candidate

Uma Candidate modifica um único repositório.

Se a Proposal exige:

- core mais overlay;
- harness mais projeto;
- dois repositórios corporativos;

ela é dividida em candidates dependentes.

Isso evita:

- commit distribuído;
- rollback parcial;
- diff impossível de atribuir;
- mistura de profiles.

### 3.5 Piloto

O piloto recomendado é o próprio repositório RPMegaBrain:

- profile personal;
- branch base main local;
- target pequeno;
- sem submodules;
- sem network;
- uma regressão determinística;
- candidate branch local;
- integração manual pelo usuário.

O piloto work.colmeia só começa após autorização organizacional e storage apropriado.

### 3.6 Níveis de risco

| Risco | Exemplos | Tratamento |
|---|---|---|
| low | docs, fixture, rubrica | Pipeline padrão |
| medium | skill, router, verifier | Suite completa do componente |
| high | policy, auth, redaction, connector adapter | Secondary approval + security review |
| forbidden | secrets, remote push, send, merge automático | Deny |

### 3.7 Modos operacionais

| Modo | Efeito |
|---|---|
| disabled | Nenhuma candidate é criada |
| dry-run | Resolve base, scope e plano; não cria worktree |
| shadow | Cria ambientes e executa baseline; não edita candidate |
| supervised | Aplica mudança com checkpoints humanos |

O default inicial é dry-run.

---

## 4. Objetivos e não objetivos

### 4.1 Objetivos

1. Consumir somente Proposal válida e aprovada.
2. Vincular autorização ao proposal, repo, base e paths.
3. Manter checkout principal intocado.
4. Criar baseline e candidate do mesmo commit.
5. Aplicar uma mudança mínima.
6. Adicionar regressão que represente o erro.
7. Provar red/green quando aplicável.
8. Bloquear alteração fora do scope.
9. Congelar snapshot local reproduzível.
10. Executar hard gates e suites relevantes.
11. Fazer review independente do diff.
12. Produzir Impact Report claro.
13. Permitir RequestChanges sem reescrever história.
14. Encerrar em decisão humana.
15. Preservar rollback e cleanup seguros.
16. Manter custo próximo de zero.
17. Preparar portabilidade na v0.6.

### 4.2 Perguntas que a versão deve responder

- Esta Proposal ainda é válida?
- Qual commit representa a base?
- A base mudou desde a aprovação?
- Quais paths podem mudar?
- O checkout principal está protegido?
- A regressão falha no baseline?
- A mesma regressão passa na candidate?
- A candidate mudou apenas o componente previsto?
- Algum hard gate regrediu?
- O code review encontrou defeito sério?
- O ganho se repete no holdout?
- O custo da mudança é aceitável?
- A hipótese da v0.4 foi fortalecida ou refutada?
- O que exatamente o usuário está aceitando?
- Como preservar ou remover a candidate?

### 4.3 Não objetivos

Ficam fora:

- push;
- pull;
- fetch automático;
- branch remota;
- PR/MR;
- merge;
- rebase;
- cherry-pick;
- force push;
- tag de release;
- alteração do branch principal;
- edição do working tree principal;
- publicação de package;
- deploy;
- escrita em Jira/Gmail/Drive/GitHub/GitLab;
- resolução automática de conflito;
- múltiplos repositórios por candidate;
- submodules no piloto;
- binary patch;
- autoaprovação;
- auto-clean de candidate suja;
- autoedição de memória;
- afrouxamento autônomo de policy;
- cloud CI obrigatória.

---

## 5. Princípios e invariantes

### 5.1 Princípios

1. **Proposal aprovada não é permissão aberta.**
2. **Base é commit, não “estado atual”.**
3. **Checkout principal é intocável.**
4. **Baseline e candidate partem da mesma base.**
5. **Uma candidate, um target primário.**
6. **Regression test prova o mecanismo.**
7. **Diff completo é a unidade de review.**
8. **Snapshot precede comparação final.**
9. **Commit local não significa publicação.**
10. **Aceite não significa merge.**
11. **RequestChanges cria nova revision.**
12. **Cleanup não usa force por padrão.**
13. **Worktree isola arquivos, não toda metadata Git.**
14. **Qualidade e segurança precedem custo.**
15. **O pipeline também pode estar errado.**

### 5.2 Invariantes herdados

Todos os invariantes v0.1–v0.4 permanecem. Em conflito, vence a regra mais restritiva.

### 5.3 Invariantes de intake

| ID | Invariante |
|---|---|
| INV-CAND-001 | Candidate nasce de Proposal ApprovedForCandidate |
| INV-CAND-002 | Proposal version e decision receipt são imutáveis |
| INV-CAND-003 | Proposal superseded não inicia Candidate |
| INV-CAND-004 | Target primário permanece único |
| INV-CAND-005 | Profile da Candidate é igual ao da Proposal |
| INV-CAND-006 | Repository binding é explícito |

### 5.4 Invariantes de autorização

| ID | Invariante |
|---|---|
| INV-AUTH-501 | --pode-fazer é obrigatório para editar Candidate |
| INV-AUTH-502 | Autorização vincula proposal, repo, base e paths |
| INV-AUTH-503 | Autorização expira no fim da execução/revision |
| INV-AUTH-504 | Mudança de base invalida autorização |
| INV-AUTH-505 | Mudança de scope exige nova aprovação |
| INV-AUTH-506 | --pode-fazer não autoriza network ou remote Git |
| INV-AUTH-507 | Freeze/commit local é capability separada |

### 5.5 Invariantes Git

| ID | Invariante |
|---|---|
| INV-GIT-501 | Main worktree não é modificada |
| INV-GIT-502 | Base é SHA resolvido e registrado |
| INV-GIT-503 | Candidate branch é local e sem upstream |
| INV-GIT-504 | Baseline worktree permanece sem change set |
| INV-GIT-505 | Candidate e baseline usam a mesma base |
| INV-GIT-506 | Push, fetch, pull, merge, rebase e cherry-pick são indisponíveis |
| INV-GIT-507 | Force operations são indisponíveis |
| INV-GIT-508 | Git common dir é tratado como protected |
| INV-GIT-509 | Worktree registry usa formato porcelain |
| INV-GIT-510 | Branch delete exige cleanup humano explícito |
| INV-GIT-511 | Worktree suja não é removida com --force |
| INV-GIT-512 | Nenhuma config Git global é alterada |

### 5.6 Invariantes de change set

| ID | Invariante |
|---|---|
| INV-CHANGE-501 | Todo arquivo alterado está no allowed_paths |
| INV-CHANGE-502 | Diff budget excedido pausa execução |
| INV-CHANGE-503 | Untracked files entram no manifest |
| INV-CHANGE-504 | Symlink novo é bloqueado por padrão |
| INV-CHANGE-505 | Binary change é bloqueada no piloto |
| INV-CHANGE-506 | Lockfile exige intenção explícita |
| INV-CHANGE-507 | Expected answers não mudam na mesma Candidate, salvo target eval |
| INV-CHANGE-508 | Sensitive paths exigem secondary approval |
| INV-CHANGE-509 | Test fixtures não carregam segredo |

### 5.7 Invariantes de avaliação

| ID | Invariante |
|---|---|
| INV-REG-501 | Causal case deve falhar na baseline e passar na Candidate |
| INV-REG-502 | Safety case pode passar nas duas |
| INV-REG-503 | Hard regression bloqueia Candidate |
| INV-REG-504 | Holdout não é visível ao Builder |
| INV-REG-505 | Code review não modifica a Candidate |
| INV-REG-506 | Review considera o diff completo contra base |
| INV-REG-507 | Same cases/config são usados na comparação |
| INV-REG-508 | Candidate inconclusiva não é tratada como aprovada |

### 5.8 Invariantes de decisão

| ID | Invariante |
|---|---|
| INV-DEC-501 | Apenas humano marca AcceptedForManualIntegration |
| INV-DEC-502 | AcceptedForManualIntegration não faz merge |
| INV-DEC-503 | Reject não apaga artefatos automaticamente |
| INV-DEC-504 | RequestChanges cria revision nova |
| INV-DEC-505 | Decision referencia snapshot e report exatos |
| INV-DEC-506 | Report alterado invalida decision pendente |

### 5.9 Estados globais

| Estado | Significado |
|---|---|
| BLOCKED | Intake, autorização, integridade ou segurança impedem |
| BUILDING | Candidate em edição autorizada |
| EVALUATING | Snapshot congelado e suites rodando |
| PASSED | Gates técnicos passaram; aguarda humano |
| FAILED | Gate obrigatório falhou |
| INCONCLUSIVE | Evidência insuficiente/instável |
| CHANGES_REQUESTED | Humano solicitou nova revision |
| ACCEPTED_FOR_MANUAL_INTEGRATION | Humano aceitou; nenhuma integração ocorreu |
| REJECTED | Humano rejeitou |
| ARCHIVED | Candidate preservada sem execução ativa |

---

## 6. Arquitetura da v0.5

### 6.1 Visão lógica

~~~mermaid
flowchart TD
    A["Candidate Intake"] --> B["Authorization Gate"]
    B --> C["Workspace Manager"]
    C --> D["Change Builder"]
    D --> E["Snapshot"]
    E --> F["Eval + Review"]
    F --> G["Impact Report"]
    G --> H["Human Decision"]
~~~

### 6.2 Componentes

| Componente | Responsabilidade | Não pode |
|---|---|---|
| Candidate Intake | Validar proposal e decision | Aprovar proposal |
| Authorization Broker | Emitir receipt de edição | Autorizar remoto |
| Base Resolver | Resolver SHA e drift | Fetch silencioso |
| Workspace Manager | Criar/lockar worktrees | Tocar main worktree |
| Environment Preparer | Reproduzir setup | Executar script não aprovado |
| Change Planner | Delimitar arquivos e passos | Expandir target |
| Candidate Builder | Editar candidate | Editar baseline/main |
| Scope Guard | Comparar diff com scope | Aceitar excesso silencioso |
| Snapshot Manager | Congelar revisão | Publicar commit |
| Regression Comparator | Baseline versus candidate | Alterar expected |
| Review Adapter | Review read-only | Corrigir diff |
| Impact Analyzer | Consolidar evidências | Aceitar candidate |
| Decision Gate | Registrar escolha humana | Merge |
| Cleanup Manager | Preservar/remover alvo exato | Force clean amplo |

### 6.3 Portas

- ProposalSourcePort;
- CandidateAuthorizationPort;
- RepositoryInspectorPort;
- BaseResolverPort;
- WorktreePort;
- EnvironmentSetupPort;
- ChangeBuilderPort;
- ScopeGuardPort;
- SnapshotPort;
- RegressionRunnerPort;
- CodeReviewPort;
- ImpactReportPort;
- HumanDecisionPort;
- CleanupPort;
- ClockPort;
- RedactionPort.

### 6.4 Fluxo

1. Ler Proposal e human decision.
2. Validar profile, target e freshness.
3. Resolver repository e base SHA.
4. Gerar Change Plan.
5. Mostrar plano, paths e budget.
6. Receber --pode-fazer.
7. Emitir Candidate Authorization.
8. Criar baseline e candidate worktrees.
9. Preparar ambientes equivalentes.
10. Executar baseline.
11. Aplicar regression case e mudança.
12. Rodar Scope Guard.
13. Mostrar diff summary.
14. Congelar Candidate Snapshot local.
15. Executar candidate suite e holdout.
16. Fazer code review independente.
17. Criar Impact Report.
18. Pedir decisão humana.
19. Manter, revisar, rejeitar ou preparar cleanup.

### 6.5 Três planos

**Control Plane**

- proposal;
- autorização;
- scope;
- states;
- decisão.

**Execution Plane**

- worktrees;
- setup;
- edição;
- testes;
- snapshot.

**Evidence Plane**

- diffs;
- manifests;
- evals;
- review;
- impact report.

Nenhum plano possui capability de remote publish.

### 6.6 Trust boundaries

~~~mermaid
flowchart LR
    A["Main checkout"] -->|"somente inspeção"| B["Candidate Control"]
    B --> C["Baseline WT"]
    B --> D["Candidate WT"]
    C --> E["Comparator"]
    D --> E
~~~

Main checkout, Git common dir, baseline e candidate são autoridades distintas.

---

## 7. Candidate Intake

### 7.1 Pré-condições

Uma Candidate só pode ser solicitada quando:

- Proposal existe;
- schema suportado;
- status ApprovedForCandidate;
- human decision válida;
- target primário suportado;
- profile ativo coincide;
- repositório está vinculado ao profile;
- Proposal não expirou ou foi superseded;
- regression plan existe;
- risk class foi calculado.

### 7.2 Freshness

O intake verifica se mudaram:

- Proposal version;
- Pattern status;
- Diagnosis confidence;
- target component hash;
- policy version;
- repository binding;
- base branch head;
- eval suite;
- human conditions.

Drift não é ignorado.

### 7.3 Decisões de intake

| Decisão | Motivo |
|---|---|
| ACCEPT | Pré-condições válidas |
| NEEDS_REAPPROVAL | Base/scope/risco mudou |
| NEEDS_EVIDENCE | Proposal ficou inconclusiva |
| REDIRECT_MEMORY | Target pertence ao curator |
| BLOCK_PROFILE | Profile/repo incompatível |
| BLOCK_RISK | Target proibido |
| SUPERSEDED | Proposal não é mais atual |

### 7.4 Candidate Request

Contém:

- request_id;
- proposal ref;
- profile;
- repository ref;
- requested base;
- requested mode;
- requested paths;
- expected suites;
- requested by;
- timestamp;
- idempotency key.

### 7.5 Idempotência

Mesmos:

- proposal version;
- base SHA;
- repository;
- profile;
- revision;

produzem a mesma candidate key.

Retry não cria branch duplicada.

### 7.6 Targets redirecionados

**Memory**

Vai para memory-curator.

**External connector permission**

Exige blueprint de risco e não entra.

**Policy loosening**

Exige ADR humano antes de Candidate Request.

**Multi-repo**

Volta para Proposal splitting.

---

## 8. Modelo de autorização

### 8.1 Duas intenções humanas

ApprovedForCandidate responde:

> Vale testar esta melhoria?

--pode-fazer responde:

> Esta execução pode escrever a mudança no workspace isolado?

Ambas são obrigatórias.

### 8.2 Candidate Authorization

Vincula:

- authorization_id;
- candidate_id;
- proposal_id/version;
- human decision id;
- profile_id;
- repository id;
- base SHA;
- candidate revision;
- allowed paths;
- allowed operations;
- forbidden operations;
- diff budget;
- expiry;
- issuer;
- nonce/hash.

### 8.3 Operações autorizáveis

- create candidate worktree;
- create local namespaced branch;
- edit allowed files;
- create regression fixtures;
- run approved commands;
- stage explicit paths;
- create local snapshot commit;
- write reports no candidate state.

### 8.4 Operações nunca autorizadas

- network egress;
- fetch/pull/push;
- remote add/set-url;
- branch upstream;
- PR/MR;
- merge/rebase/cherry-pick;
- tag;
- write em main worktree;
- write em baseline;
- global git config;
- credential helper;
- external connector write;
- secret read;
- cleanup com force.

### 8.5 Expiração

Authorization expira quando:

- revision termina;
- base muda;
- Proposal muda;
- scope muda;
- risk aumenta;
- profile muda;
- timeout é atingido;
- usuário revoga;
- hard policy falha.

### 8.6 Freeze authorization

Freeze/commit local é capability separada porque:

- cria objeto Git durável;
- move branch local;
- fixa o conteúdo avaliado.

Antes do freeze, o usuário recebe:

- arquivos;
- diff stat;
- regression cases;
- sensitive paths;
- comandos executados;
- known limitations.

### 8.7 Relação com teach

Sem --pode-fazer:

- explicar Proposal;
- mostrar Change Plan;
- fornecer exemplos;
- indicar paths;
- não criar worktree de escrita;
- não editar.

Com --pode-fazer:

- editar somente candidate;
- explicar cada bloco relevante;
- parar antes do freeze quando necessário;
- mostrar diff;
- continuar sem tocar no projeto principal.

### 8.8 Revogação

Revogar:

- bloqueia novos comandos de escrita;
- preserva worktrees e logs;
- marca Candidate PAUSED;
- não executa cleanup;
- não desfaz automaticamente o que já ocorreu.

---

## 9. Resolução da base

### 9.1 Base imutável

A base é um commit SHA completo.

Não é:

- nome solto de branch;
- HEAD futuro;
- working tree;
- remote branch não resolvida;
- estado com mudanças não commitadas.

### 9.2 Ordem de resolução

1. Base SHA explícito da Proposal, se ainda válido.
2. SHA de branch local configurada.
3. SHA fornecido pelo usuário.
4. Bloquear e pedir decisão.

Não há fetch automático.

### 9.3 Dirty main

O checkout principal pode possuir mudanças do usuário.

A v0.5:

- detecta;
- registra paths sem conteúdo;
- não copia;
- não faz stash;
- não limpa;
- não bloqueia por padrão quando a base SHA é inequívoca;
- alerta que a Candidate não inclui essas mudanças.

Se a Proposal depende delas, o usuário precisa:

- commitá-las por conta própria; ou
- fornecer um base snapshot explícito em uma futura revisão.

### 9.4 Base drift

Se o branch local avançou após a aprovação:

- comparar old_base e current_base;
- identificar target component drift;
- invalidar autorização;
- reavaliar Proposal freshness;
- pedir nova aprovação.

Não se faz rebase automático da Candidate.

### 9.5 Ancestralidade

O Base Resolver registra:

- protected base branch;
- base SHA;
- merge-base com branch atual;
- se base é ancestor;
- repository identity;
- object availability.

Base não ancestral exige decisão explícita e sai do piloto.

### 9.6 Repository identity

Vinculação usa:

- canonical repo root;
- Git common dir resolvido;
- repository id;
- remote URLs hashadas, apenas para identidade;
- default branch configurada;
- profile owner;
- filesystem device/inode quando aplicável.

Não se confia somente no nome da pasta.

### 9.7 Estado mínimo

~~~yaml
base:
  requested_ref: refs/heads/main
  resolved_sha: 6f7a...
  repository_id: repo_01J...
  main_dirty: true
  dirty_paths_count: 2
  includes_uncommitted: false
  remote_refreshed: false
~~~

---

## 10. Modelo de worktrees

### 10.1 Por que worktree

Uma Git worktree fornece outro checkout do mesmo repositório, permitindo trabalhar em arquivos separados sem trocar o branch do checkout principal.

Ela não é uma sandbox completa porque worktrees compartilham:

- object database;
- refs comuns;
- repository config;
- hooks do common dir;
- parte da metadata Git.

Por isso, isolamento de worktree é combinado com:

- sandbox;
- Git adapter restrito;
- command policy;
- network deny;
- path validation.

### 10.2 Topologia

~~~mermaid
flowchart TD
    A["Git common repository"] --> B["Main worktree"]
    A --> C["Baseline worktree"]
    A --> D["Candidate worktree"]
    C --> E["Baseline results"]
    D --> F["Candidate results"]
    E --> G["Comparator"]
    F --> G
~~~

### 10.3 Baseline worktree

- detached no base SHA;
- sem branch;
- read-only para source durante setup;
- testes podem criar somente artifacts ignorados/temporários;
- nunca recebe patch;
- é recriada quando integridade falha;
- removida automaticamente apenas quando limpa e registrada.

### 10.4 Candidate worktree

- nasce do mesmo base SHA;
- recebe branch local namespaced;
- sem upstream;
- locked durante a Candidate;
- única área editável;
- path registrado;
- revisões permanecem no mesmo lifecycle;
- nunca vira main checkout automaticamente.

### 10.5 Naming

Formato:

~~~text
megabrain/candidate/<proposal-short-id>-r<revision>-<slug>
~~~

Exemplo:

~~~text
megabrain/candidate/prop-01j-r1-jira-field-filter
~~~

Regras:

- normalizar slug;
- comprimento limitado;
- branch collision gera novo id, não force;
- nenhum prefixo de branch corporativo é inferido;
- work.colmeia pode definir naming próprio no profile.

### 10.6 Path

Formato:

~~~text
<state_root>/<profile>/candidates/<candidate_id>/worktrees/
├── baseline/
└── candidate/
~~~

Regras:

- state_root absoluto e configurado;
- nunca usar home, raiz ou repo root como alvo de remoção;
- path deve ser filho exato do candidate registry;
- symlink no caminho bloqueia;
- collision bloqueia;
- path é criado com permissão restrita.

### 10.7 Lock

Worktrees são locked com reason:

~~~text
megabrain candidate <candidate_id> active
~~~

Lock:

- previne prune acidental;
- é removido somente no cleanup;
- não substitui registry;
- não autoriza force.

### 10.8 Worktree registry

O adapter usa saída porcelain com terminador NUL para:

- paths;
- HEAD;
- branch;
- detached;
- locked;
- prunable.

Não faz parsing de output humano/localizado.

### 10.9 Submodules

O piloto bloqueia repositórios ou target paths que dependam de submodules porque:

- worktree support possui limitações;
- setup pode mudar estado compartilhado;
- cleanup é mais arriscado;
- comparação fica menos reproduzível.

Suporte futuro exige ADR próprio.

### 10.10 Handoff

Handoff do Codex pode ajudar inspeção humana, mas não é o mecanismo canônico da v0.5.

O estado autoritativo é:

- Candidate Manifest;
- branch;
- worktree path;
- snapshot;
- report.

Mover chat não altera decisão.

---

## 11. Ambiente e setup reproduzível

### 11.1 Problema

Uma worktree contém arquivos rastreados, mas pode não conter:

- dependências instaladas;
- arquivos ignorados;
- caches;
- bancos locais;
- artefatos gerados;
- variáveis de ambiente;
- ferramentas globais.

Portanto, “mesmo commit” não significa automaticamente “mesmo ambiente”.

### 11.2 Environment Manifest

Antes da edição, o MegaBrain gera um manifest com:

- sistema operacional e arquitetura;
- runtime e versões de ferramentas;
- hash de lockfiles;
- comandos de setup, build, lint e teste;
- nomes de variáveis necessárias, sem valores secretos;
- fontes de dependências;
- política de rede;
- paths de cache, temporários, portas e bancos;
- hash do script de setup;
- resultado do preflight.

O manifest é idêntico para baseline e candidate.

### 11.3 Origem do setup

O setup executável deve vir do base SHA ou da configuração confiável do profile.

Regras:

- inspecionar e hashear antes de executar;
- nunca executar um setup alterado pelo candidate durante a comparação;
- scripts modificados pelo candidate são conteúdo sob avaliação, não infraestrutura confiável;
- package scripts, hooks e geradores são tratados como código executável;
- mudança no setup exige novo plano e autorização adequada.

### 11.4 Rede e dependências

Padrão:

- rede negada;
- lockfile obrigatório quando o ecossistema oferecer um;
- preferir cache local validado;
- nenhuma atualização implícita de dependência;
- nenhuma resolução flutuante;
- nenhuma credencial de registry exposta ao processo.

Se o ambiente não puder ser preparado offline, o status é `BlockedByEnvironment`. A v0.5 não amplia a permissão silenciosamente.

### 11.5 Isolamento entre lados

Baseline e candidate recebem:

- diretórios temporários distintos;
- caches graváveis distintos;
- portas distintas ou execução serial;
- bancos e filas efêmeros distintos;
- mesma seed;
- mesmo timezone e locale;
- limites equivalentes de CPU, memória e tempo;
- mesmas fontes read-only.

O setup não pode modificar código rastreado. Se modificar, o preflight falha e registra o diff.

### 11.6 Arquivos ignorados

Quando um projeto depende de arquivos ignorados, as opções são, em ordem:

1. gerar artefatos efêmeros a partir de configuração segura;
2. usar uma allowlist explícita de arquivos copiáveis;
3. usar `.worktreeinclude`, se o ambiente Codex escolhido suportar e o repositório aprovar;
4. bloquear e pedir preparação humana.

Nunca copiar:

- `.env` real;
- tokens;
- chaves privadas;
- certificados pessoais;
- cookies;
- credenciais Git;
- dumps com dados reais.

Cada cópia permitida é hasheada, registrada e repetida de forma idêntica nos dois lados.

### 11.7 Preflight obrigatório

O preflight verifica:

- worktrees apontam para o base SHA correto;
- baseline está limpo;
- candidate ainda não possui mudanças inesperadas;
- toolchain está disponível;
- nenhum path proibido está montado como gravável;
- rede está conforme a policy;
- testes de sanidade podem iniciar;
- espaço em disco é suficiente;
- profile e armazenamento são coerentes.

Falha no preflight impede edição.

---

## 12. Change Plan

### 12.1 Objetivo

O Change Plan traduz a proposta aprovada para um plano executável, pequeno e verificável. Ele é produzido antes de `--pode-fazer` e não contém a implementação completa no modo teach.

### 12.2 Conteúdo mínimo

~~~yaml
change_plan:
  hypothesis: "Se X mudar, Y melhora porque Z"
  target_component: context_router
  base_sha: "..."
  allowed_paths:
    - src/router/**
    - evals/cases/router/**
  forbidden_paths:
    - profiles/work/colmeia/secrets/**
  steps:
    - add_failing_regression
    - apply_minimal_change
    - run_targeted_checks
    - run_full_candidate_suite
  non_goals:
    - change_memory_manager
  diff_budget:
    files: 6
    added_lines: 220
    deleted_lines: 120
  verification_commands:
    - "..."
  rollback: discard_candidate
~~~

Também inclui:

- requisitos afetados;
- invariantes protegidas;
- casos de regressão planejados;
- riscos e paths sensíveis;
- dependências e setup;
- critério de parada;
- evidências esperadas;
- questões abertas.

### 12.3 Freeze do plano

Depois da aprovação de execução:

- o plano recebe hash;
- paths e orçamento ficam congelados;
- qualquer expansão exige pausa;
- mudança de hipótese gera nova revisão da proposta;
- mudança de repo ou base SHA exige nova autorização;
- mudança apenas operacional, sem alterar escopo, pode gerar revisão do plano registrada.

O builder nunca transforma uma descoberta em autorização.

---

## 13. Candidate Builder

### 13.1 Responsabilidade

O Candidate Builder aplica uma alteração mínima somente na worktree candidate, obedecendo ao plano congelado.

### 13.2 Sequência

1. validar autorização e lease;
2. validar base SHA e environment manifest;
3. criar primeiro o caso de regressão causal quando aplicável;
4. provar que o caso falha no baseline;
5. aplicar a menor mudança capaz de satisfazer a hipótese;
6. executar verificações direcionadas;
7. medir escopo completo;
8. parar para freeze.

### 13.3 Ferramentas

O builder recebe capacidades estreitas:

- ler candidate e fontes autorizadas;
- editar somente paths permitidos;
- executar comandos allowlisted no sandbox;
- produzir arquivos efêmeros em diretórios controlados;
- consultar status e diff por adapter.

Ele não recebe:

- Git remoto;
- escrita no baseline;
- escrita no checkout principal;
- gerenciador de credenciais;
- comandos destrutivos genéricos;
- conectores externos com escrita;
- decisão humana simulada.

### 13.4 Alteração mínima

Uma candidate deve tratar uma hipótese principal. Refactors oportunistas, atualizações de dependência não necessárias e formatação global ficam fora.

Quando duas mudanças são independentes, devem virar duas candidates para preservar atribuição causal.

### 13.5 Iterações

Durante a fase editável:

- cada ciclo recebe um número;
- arquivos tocados são registrados;
- comandos e resultados são resumidos;
- falhas não são apagadas do histórico;
- nenhuma edição é ocultada por reset destrutivo.

Antes do snapshot, o estado atual deve ser inteiramente explicável pelo Change Set.

---

## 14. Scope Guard e orçamento de diff

### 14.1 Fonte de verdade

O Scope Guard calcula o conjunto completo de mudanças em relação ao base SHA, incluindo:

- rastreados modificados;
- adicionados ao index;
- não rastreados;
- renomes e deleções;
- permissões de arquivo;
- symlinks;
- binários;
- submodules;
- lockfiles;
- artefatos gerados.

Ver somente `git diff` sem untracked é insuficiente.

### 14.2 Gates

O candidate bloqueia quando:

- toca path fora da allowlist;
- excede files ou line budget;
- altera arquivo proibido;
- inclui segredo detectado;
- adiciona binário não aprovado;
- cria symlink;
- altera submodule;
- modifica lockfile sem escopo explícito;
- altera expected answer protegido;
- muda setup confiável;
- produz arquivo grande não previsto.

### 14.3 Classes de path

| Classe | Exemplos | Regra |
|---|---|---|
| Proibido | `.git/**`, credenciais, secrets, checkout principal | Nunca editar |
| Alto risco | workflows CI/CD, hooks, scripts de instalação, auth, redaction, policies | Aprovação humana específica |
| Controlado | código do componente, testes, schemas | Dentro do plano e budget |
| Baixo risco | docs da candidate, fixtures sintéticas | Permitido se relacionado |

Policy loosening é proibido por padrão, ainda que o arquivo esteja dentro da allowlist. Policy mais restritiva requer ADR e regressões apropriadas.

### 14.4 Divergência

Ao detectar divergência:

1. parar o builder;
2. preservar evidência;
3. marcar `OutOfScope`;
4. explicar a origem provável;
5. pedir uma nova decisão.

O sistema não corrige o escopo apagando arquivos automaticamente.

---

## 15. Regression-first

### 15.1 Tipos de caso

Cada candidate deve conter, quando aplicável:

- **causal:** reproduz a falha alvo;
- **safety:** protege comportamento já correto;
- **boundary:** testa limite da regra;
- **privacy:** protege separação de profile e dados;
- **holdout:** verifica generalização sem orientar a implementação.

### 15.2 Red/green obrigatório

O caso causal esperado:

- falha no baseline;
- passa no candidate;
- mede o requisito real, não um detalhe incidental;
- não aceita uma resposta mais fraca apenas para ficar verde.

Se o baseline já passa, o caso não demonstra a hipótese. Se ambos falham, a correção não foi comprovada. Se o candidate só passa após alterar o expected answer, o gate bloqueia.

### 15.3 Golden data

Respostas esperadas existentes são imutáveis durante candidates comuns.

Exceção: proposta cujo alvo explícito seja evaluator ou suite de evals. Nesse caso:

- a mudança de golden data tem revisão humana separada;
- casos holdout permanecem ocultos;
- a alteração não pode ser usada para avaliar a si mesma sem controle externo;
- o report separa mudança de métrica de melhoria do sistema.

### 15.4 Casos estocásticos

Para comportamento não determinístico:

- executar amostras suficientes definidas pela suite;
- preservar seeds quando suportadas;
- comparar distribuições e intervalos;
- evitar concluir por uma única execução favorável;
- marcar como inconclusivo quando o poder estatístico for insuficiente.

---

## 16. Candidate Snapshot e commits locais

### 16.1 Fase editável e fase congelada

Enquanto editável, o candidate pode conter mudanças não commitadas. Após Scope Guard e aprovação de freeze:

1. gerar Change Set final;
2. adicionar somente paths explícitos;
3. criar commit local imutável;
4. registrar commit, tree, parent e diff hashes;
5. bloquear novas avaliações contra estado não congelado.

### 16.2 Commit local

O commit:

- permanece local;
- não possui upstream;
- usa identidade técnica explícita do MegaBrain;
- não desabilita signing ou hooks para contornar policy;
- inclui `candidate_id`, revision e proposal_id na mensagem;
- nunca é amendado;
- nunca é rebased;
- nunca é pushed pela v0.5.

### 16.3 Revisões

Uma mudança após freeze cria nova revision e novo commit descendente, sem reescrever histórico.

Cada revision recebe:

- novo snapshot;
- novo Scope Guard;
- nova avaliação;
- nova revisão de código;
- novo Impact Report;
- nova decisão humana.

Resultados anteriores permanecem auditáveis e não autorizam a revisão nova.

---

## 17. Avaliação baseline versus candidate

### 17.1 Comparabilidade

Os dois lados usam:

- mesmo base SHA inicial;
- mesmo Environment Manifest;
- mesmo modelo, provider e reasoning;
- mesmos snapshots de contexto;
- mesmas policies e skills não alteradas;
- mesmos budgets;
- mesma versão de evaluator;
- mesmos casos elegíveis;
- ordem controlada ou contrabalanceada;
- armazenamento separado de efeitos colaterais.

A única variável intencional deve ser o Change Set.

### 17.2 Ordem dos gates

1. segurança e policy;
2. integridade do experimento;
3. correção funcional;
4. prevenção de falso sucesso;
5. qualidade;
6. estabilidade;
7. eficiência.

Uma melhora de tokens não compensa violação de policy ou perda de correção.

### 17.3 Resultado

Cada métrica é classificada como:

- `Improved`;
- `Equivalent`;
- `Regressed`;
- `Inconclusive`;
- `NotApplicable`.

O resultado geral pode ser:

- `EligibleForReview`;
- `BlockedByHardRegression`;
- `NeedsMoreEvidence`;
- `InvalidExperiment`;
- `BlockedByEnvironment`.

### 17.4 Suite

A execução inclui:

- caso causal;
- regressões do componente;
- regressões transversais;
- hard gates;
- holdout aplicável;
- casos do profile permitido;
- comparação com baseline histórico da v0.4, apenas como evidência adicional.

O baseline principal da candidate é sempre executado a partir do mesmo base SHA.

---

## 18. Code Review independente

### 18.1 Papel

O Code Reviewer é um papel separado do builder e opera read-only sobre:

- Change Plan;
- diff completo base versus snapshot;
- testes;
- resultados da comparação;
- policies relevantes;
- contexto mínimo necessário.

Ele não corrige o candidate durante a revisão.

### 18.2 Critérios

Revisar:

- aderência à hipótese;
- correção e edge cases;
- segurança e privacidade;
- integridade dos testes;
- risco de falso positivo;
- escopo e simplicidade;
- compatibilidade;
- observabilidade;
- rollback;
- documentação necessária.

### 18.3 Severidade

| Severidade | Significado | Gate |
|---|---|---|
| P0 | risco crítico, perda de dados, bypass de policy | Bloqueia |
| P1 | bug provável ou regressão séria | Bloqueia |
| P2 | problema relevante com workaround | Decisão humana explícita |
| P3 | melhoria não bloqueante | Registrar |

### 18.4 Independência prática

Na v0.5, independência significa separação de papel, contexto e permissão, ainda que o mesmo motor Codex seja usado:

- nova execução;
- prompt e checklist próprios;
- sem memória do builder além dos artefatos oficiais;
- nenhuma escrita;
- findings estruturados;
- nenhuma autoridade de aprovação.

O comando `/review` ou mecanismo equivalente do Codex pode complementar a revisão, mas o formato canônico permanece o Code Review Report do MegaBrain.

---

## 19. Impact Report

### 19.1 Objetivo

O Impact Report reúne evidência suficiente para uma decisão humana sem exigir reconstruir toda a execução.

### 19.2 Conteúdo

- proposta, hipótese e motivação;
- repo identity e base SHA;
- candidate branch, revision, commit e tree;
- arquivos e linhas alteradas;
- paths sensíveis;
- red/green do caso causal;
- regressões e hard gates;
- holdout e incerteza;
- findings da revisão;
- métricas de qualidade, estabilidade, latência e tokens;
- custo incremental;
- impactos de segurança e privacidade;
- comandos executados;
- desvios e limitações;
- evidências reproduzíveis;
- recomendação do sistema;
- hashes de todos os artefatos.

### 19.3 Recomendação

Valores possíveis:

- `RecommendAcceptForManualIntegration`;
- `RecommendRequestChanges`;
- `RecommendReject`;
- `RecommendDefer`;
- `InsufficientEvidence`.

A recomendação não é decisão e não produz merge.

### 19.4 Integridade

O report referencia um snapshot exato. Se commit, tree, suite, evaluator ou evidência mudar, o report fica `Stale` e não pode apoiar aceitação.

---

## 20. Decisão humana

### 20.1 Estados

~~~mermaid
stateDiagram-v2
    [*] --> AwaitingDecision
    AwaitingDecision --> AcceptedForManualIntegration
    AwaitingDecision --> ChangesRequested
    AwaitingDecision --> Rejected
    AwaitingDecision --> Deferred
    AwaitingDecision --> NeedsEvidence
    ChangesRequested --> AwaitingDecision: nova revision
    NeedsEvidence --> AwaitingDecision: novo report
~~~

### 20.2 Significados

- `AcceptedForManualIntegration`: o snapshot pode ser integrado por um humano fora do pipeline v0.5.
- `ChangesRequested`: há feedback explícito para uma nova revision.
- `Rejected`: a hipótese ou implementação não deve prosseguir.
- `Deferred`: decisão adiada, preservando o candidate.
- `NeedsEvidence`: falta uma verificação específica.

### 20.3 Binding

A decisão referencia:

- proposal_id e versão;
- candidate_id e revision;
- base SHA;
- snapshot commit/tree;
- Impact Report hash;
- decisor;
- timestamp;
- justificativa;
- condições, quando houver.

Qualquer mudança material invalida a decisão.

### 20.4 Limite de autoridade

`AcceptedForManualIntegration`:

- não faz merge;
- não faz cherry-pick;
- não faz push;
- não abre PR;
- não modifica branch principal;
- não concede credenciais;
- não aprova revisão futura.

É uma autorização para handoff humano do snapshot exato.

---

## 21. Rollback, descarte e cleanup

### 21.1 Rollback conceitual

Como a v0.5 nunca altera a branch principal, seu rollback padrão é descartar a candidate. Não existe rollback de produção dentro deste escopo.

### 21.2 Rejeição não apaga

Ao rejeitar:

- registrar decisão;
- congelar estado;
- arquivar patch, manifests, reports e hashes;
- manter separação por profile;
- não remover branch ou worktree automaticamente.

Isso preserva auditabilidade e permite entender falsos caminhos.

### 21.3 Cleanup explícito

Cleanup material exige:

- candidate_id exato;
- resolução do path pelo registry, nunca por input livre;
- confirmação humana;
- decisão registrada ou abandono explícito;
- archive receipt válido;
- worktree limpa ou snapshot preservado;
- ausência de processo usando o lease.

Não se usa `--force` como recuperação automática.

### 21.4 Ordem segura

1. validar registry e identidade Git;
2. arquivar artefatos;
3. verificar dirty state;
4. desbloquear worktree exata;
5. remover worktree exata;
6. confirmar ausência no porcelain registry;
7. opcionalmente remover branch local em operação separada;
8. emitir Cleanup Receipt.

Branch deletion requer confirmação própria. Um candidate pode perder sua worktree sem perder a branch e o snapshot.

### 21.5 TTL

TTL gera aviso, nunca exclusão automática de worktree dirty ou candidate sem decisão.

Baseline temporário limpo pode ser removido automaticamente após:

- resultados persistidos;
- hashes verificados;
- nenhuma etapa pendente;
- lease encerrado.

### 21.6 Recuperação

Se cleanup parcial falhar:

- marcar `CleanupIncomplete`;
- manter lock quando seguro;
- não executar prune genérico;
- mostrar ações exatas necessárias;
- permitir retry idempotente.

---

## 22. Segurança Git

### 22.1 Modelo de capacidades

| Categoria | Operações | Regra |
|---|---|---|
| Leitura | `status`, `rev-parse`, `merge-base`, `diff`, `show`, `log`, `ls-files`, `worktree list` | Permitidas via adapter |
| Escrita controlada | criar/lock/unlock/remover worktree exata, criar branch local namespaced, adicionar paths explícitos, commit local | Somente na fase e alvo corretos |
| Remoto | fetch, pull, push, remote mutation, PR | Proibido |
| Integração | merge, rebase, cherry-pick, tag | Proibido |
| Destrutivo | reset hard, clean force, branch force-delete, checkout destrutivo, prune genérico | Proibido |
| Configuração | config global/system, credential helper, hooks | Proibido |

### 22.2 Adapter estreito

O runtime não oferece um shell Git irrestrito para operações mutáveis. Cada operação recebe:

- tipo fechado;
- repo identity;
- candidate_id;
- paths resolvidos;
- preconditions;
- postconditions;
- evento de auditoria.

Argumentos adicionais desconhecidos são rejeitados.

### 22.3 Proteção do checkout principal

Antes e depois de cada fase, registrar no checkout principal:

- HEAD;
- branch;
- status porcelain;
- hashes dos arquivos rastreados já dirty;
- worktree registry.

O sistema compara os snapshots sem ler conteúdo sensível desnecessário. Qualquer nova mutação atribuível ao pipeline é hard failure.

### 22.4 Metadados compartilhados

Worktrees compartilham object database e parte dos refs/config. Por isso:

- isolamento de path não é sandbox completo;
- a candidate não edita hooks ou common Git dir;
- refs fora do namespace são read-only;
- branch protection local é verificada;
- rede permanece negada;
- filesystem policy protege common dir;
- comandos Git recebem environment higienizado.

### 22.5 Hooks

Hooks existentes são código do repositório/ambiente e podem executar em operações Git.

Na v0.5:

- o preflight identifica origem e hash dos hooks relevantes;
- hooks não são editados pelo candidate;
- seu output é tratado como não confiável;
- falhas bloqueiam, não são ignoradas automaticamente;
- bypass como `--no-verify` exige policy explícita e, no piloto, permanece desabilitado.

### 22.6 Branch já ocupada

Se uma branch estiver checked out em outra worktree, o pipeline não força checkout nem remove a outra worktree. Gera novo candidate_id ou bloqueia para intervenção humana.

---

## 23. Perfis, privacidade e ColmeIA

### 23.1 Isolamento

Cada candidate pertence a exatamente um profile e storage domain.

Não compartilhar entre personal e work.colmeia:

- worktrees;
- patches;
- traces raw;
- eval inputs;
- reports não sanitizados;
- caches;
- memória;
- credenciais;
- artifacts de setup.

### 23.2 Dados corporativos

Uma candidate ColmeIA pode usar apenas:

- repo autorizado;
- sources autorizadas do profile;
- casos corporativos dentro do storage corporativo;
- dados mínimos necessários;
- conectores read-only previamente configurados.

WAC, Jira, logs, screenshots e código corporativo não são copiados para o repositório pessoal do MegaBrain.

### 23.3 Sanitização

Casos reais só podem virar eval reutilizável fora do profile quando:

- sanitizados;
- reescritos para remover identificadores e segredos;
- revistos por humano;
- acompanhados de provenance;
- aprovados pela política da empresa.

Hash não anonimiza conteúdo.

### 23.4 Conectores

O pipeline não amplia integração:

- GitHub/Jira/Gmail continuam read-only quando autorizados;
- nenhum comentário, transição, email, push ou PR;
- dados recuperados não viram fixture automaticamente;
- screenshots são ações explícitas e não contínuas.

### 23.5 Propostas de memória

Insights produzidos durante a candidate podem gerar Memory Candidate, mas a promoção continua pertencendo ao Memory Curator. A v0.5 não grava memória longa diretamente.

---

## 24. Interfaces e comandos

~~~bash
megabrain candidate request --proposal <id> --repo <path> --profile <profile>
megabrain candidate plan <candidate-id>
megabrain candidate authorize <candidate-id> --expires-in 2h
megabrain candidate create <candidate-id>
megabrain candidate status <candidate-id>
megabrain candidate diff <candidate-id>
megabrain candidate scope-check <candidate-id>
megabrain candidate freeze <candidate-id>
megabrain candidate eval <candidate-id> --revision <n>
megabrain candidate review <candidate-id> --revision <n>
megabrain candidate report <candidate-id> --revision <n>
megabrain candidate decide <candidate-id> --decision needs-evidence
megabrain candidate request-changes <candidate-id> --feedback <file>
megabrain candidate accept <candidate-id> --report-hash <hash>
megabrain candidate reject <candidate-id> --reason <file>
megabrain candidate defer <candidate-id> --until <date>
megabrain candidate export <candidate-id> --format patch
megabrain candidate cleanup <candidate-id>
~~~

### 24.1 `--pode-fazer`

A flag aparece apenas na ação que inicia escrita controlada:

~~~bash
megabrain candidate build <candidate-id> --pode-fazer
~~~

Ela autoriza somente:

- aquele candidate_id;
- aquele repo identity;
- aquele base SHA;
- aquele Change Plan;
- aqueles paths;
- durante aquela lease.

Ela não autoriza push, merge, PR, escrita externa ou cleanup.

### 24.2 Ausências intencionais

Não existem na v0.5:

- `candidate merge`;
- `candidate push`;
- `candidate open-pr`;
- `candidate deploy`;
- `candidate auto-accept`.

---

## 25. Estrutura de diretórios

~~~text
megabrain/
├── core/
│   └── schemas/
│       └── v5/
├── src/
│   └── candidates/
│       ├── intake/
│       ├── authorization/
│       ├── base/
│       ├── worktree/
│       ├── environment/
│       ├── planning/
│       ├── builder/
│       ├── scope/
│       ├── regression/
│       ├── snapshot/
│       ├── comparison/
│       ├── review/
│       ├── impact/
│       ├── decision/
│       └── cleanup/
├── policies/
│   └── candidates/
├── evals/
│   ├── cases/candidates/
│   ├── holdout/candidates/
│   └── reports/candidates/
├── feedback/
│   └── proposals/
└── docs/
    ├── runbooks/candidate-recovery.md
    └── adr/

<state_root>/<profile>/candidates/
└── <candidate_id>/
    ├── manifest.yaml
    ├── authorization.yaml
    ├── lease.yaml
    ├── plan.yaml
    ├── environment.yaml
    ├── worktrees/
    │   ├── baseline/
    │   └── candidate/
    ├── revisions/
    │   └── 001/
    │       ├── change-set.yaml
    │       ├── snapshot.yaml
    │       ├── comparison.yaml
    │       ├── review.yaml
    │       └── impact-report.md
    ├── decisions/
    └── cleanup/
~~~

`state_root`, worktrees, raw reports corporativos e arquivos efêmeros ficam fora do Git do harness.

---

## 26. Contratos e schemas

### 26.1 Catálogo de versões

| Schema | Versão |
|---|---:|
| `run_manifest` | 5 |
| `candidate_request` | 1 |
| `candidate_authorization` | 1 |
| `workspace_lease` | 1 |
| `environment_manifest` | 1 |
| `change_plan` | 1 |
| `change_set` | 1 |
| `candidate_snapshot` | 1 |
| `regression_comparison` | 1 |
| `code_review_report` | 1 |
| `impact_report` | 1 |
| `candidate_decision` | 1 |
| `cleanup_receipt` | 1 |

Todos usam validação strict, IDs opacos, timestamps UTC e hash do payload canônico.

### 26.2 Candidate Request

~~~yaml
schema_version: 1
candidate_id: cand_01J...
proposal:
  id: prop_01J...
  version: 3
  decision: ApprovedForCandidate
profile: work.colmeia
repository:
  path: /repos/project
  identity: sha256:...
requested_target:
  component: context_router
  paths:
    - src/router/**
requested_by: user
created_at: 2026-09-11T12:00:00Z
~~~

### 26.3 Candidate Authorization

~~~yaml
schema_version: 1
authorization_id: auth_01J...
candidate_id: cand_01J...
proposal_ref:
  id: prop_01J...
  version: 3
repository_identity: sha256:...
base_sha: 8f2a...
allowed_paths:
  - src/router/**
  - evals/cases/router/**
diff_budget:
  files: 6
  added_lines: 220
  deleted_lines: 120
capabilities:
  candidate_write: true
  baseline_write: false
  main_checkout_write: false
  git_remote: false
  external_write: false
authorized_by: user
authorized_at: 2026-09-11T12:10:00Z
expires_at: 2026-09-11T14:10:00Z
payload_hash: sha256:...
~~~

### 26.4 Workspace Lease

~~~yaml
schema_version: 1
lease_id: lease_01J...
candidate_id: cand_01J...
owner_run_id: run_01J...
repository_identity: sha256:...
base_sha: 8f2a...
baseline_path: /state/work.colmeia/candidates/cand_01J/worktrees/baseline
candidate_path: /state/work.colmeia/candidates/cand_01J/worktrees/candidate
locked: true
issued_at: 2026-09-11T12:11:00Z
heartbeat_at: 2026-09-11T12:15:00Z
expires_at: 2026-09-11T14:11:00Z
~~~

### 26.5 Environment Manifest

~~~yaml
schema_version: 1
candidate_id: cand_01J...
base_sha: 8f2a...
platform:
  os: linux
  arch: x86_64
toolchain:
  node: 24.7.0
lockfiles:
  package-lock.json: sha256:...
network: denied
setup:
  source: trusted_profile
  command_id: setup_node_locked
  script_hash: sha256:...
environment_names:
  - NODE_ENV
isolation:
  separate_tmp: true
  separate_cache: true
preflight: passed
payload_hash: sha256:...
~~~

### 26.6 Change Plan e Change Set

~~~yaml
schema_version: 1
candidate_id: cand_01J...
revision: 1
hypothesis: "..."
base_sha: 8f2a...
allowed_paths:
  - src/router/**
steps:
  - id: regression
    expected: baseline_red_candidate_green
non_goals:
  - memory_changes
frozen_at: 2026-09-11T12:20:00Z
plan_hash: sha256:...
---
schema_version: 1
candidate_id: cand_01J...
revision: 1
files:
  - path: src/router/select.ts
    status: modified
    old_blob: sha256:...
    new_blob: sha256:...
summary:
  files: 3
  added_lines: 74
  deleted_lines: 21
scope_guard: passed
diff_hash: sha256:...
~~~

### 26.7 Candidate Snapshot

~~~yaml
schema_version: 1
candidate_id: cand_01J...
revision: 1
branch: megabrain/cand_01J/router-selection
base_sha: 8f2a...
commit_sha: a72c...
tree_sha: 913b...
parent_sha: 8f2a...
change_set_hash: sha256:...
environment_hash: sha256:...
frozen_at: 2026-09-11T12:40:00Z
~~~

### 26.8 Regression Comparison

~~~yaml
schema_version: 1
candidate_id: cand_01J...
revision: 1
snapshot_commit: a72c...
baseline_sha: 8f2a...
suite_version: 12
evaluator_version: 4
environment_hash: sha256:...
causal_case:
  baseline: failed
  candidate: passed
hard_gates:
  policy_violations: 0
  profile_leaks: 0
  false_successes: 0
metrics:
  requirement_coverage:
    baseline: 0.82
    candidate: 0.94
    classification: Improved
overall: EligibleForReview
comparison_hash: sha256:...
~~~

### 26.9 Code Review Report

~~~yaml
schema_version: 1
candidate_id: cand_01J...
revision: 1
snapshot_commit: a72c...
reviewer_run_id: run_review_01J...
mode: read_only
findings:
  - id: finding_001
    severity: P2
    path: src/router/select.ts
    summary: "..."
    evidence: "..."
recommendation: human_decision_required
review_hash: sha256:...
~~~

### 26.10 Impact Report

~~~yaml
schema_version: 1
candidate_id: cand_01J...
revision: 1
proposal_ref: prop_01J...@3
base_sha: 8f2a...
snapshot_commit: a72c...
change_set_hash: sha256:...
comparison_hash: sha256:...
review_hash: sha256:...
hard_gates_passed: true
recommendation: RecommendAcceptForManualIntegration
limitations:
  - "..."
report_hash: sha256:...
~~~

### 26.11 Candidate Decision

~~~yaml
schema_version: 1
decision_id: decision_01J...
candidate_id: cand_01J...
revision: 1
snapshot_commit: a72c...
report_hash: sha256:...
decision: AcceptedForManualIntegration
decided_by: user
reason: "Evidência suficiente; integração será manual"
conditions: []
decided_at: 2026-09-11T13:30:00Z
payload_hash: sha256:...
~~~

### 26.12 Cleanup Receipt

~~~yaml
schema_version: 1
cleanup_id: cleanup_01J...
candidate_id: cand_01J...
archive_hash: sha256:...
removed_worktrees:
  - /state/work.colmeia/candidates/cand_01J/worktrees/baseline
  - /state/work.colmeia/candidates/cand_01J/worktrees/candidate
branch_deleted: false
forced: false
confirmed_by: user
completed_at: 2026-09-12T10:00:00Z
~~~

### 26.13 Run Manifest v5

O v5 adiciona:

- candidate_id;
- proposal_ref;
- authorization hash;
- repo identity e base SHA;
- worktree lease;
- environment hash;
- Change Plan hash;
- revision e snapshot;
- comparison/review/report/decision hashes;
- Git capabilities efetivas;
- main-checkout before/after fingerprint;
- cleanup status.

---

## 27. Tracing e observabilidade

### 27.1 Eventos

~~~text
candidate.requested
candidate.intake_passed
candidate.intake_blocked
candidate.authorized
candidate.authorization_expired
candidate.base_resolved
candidate.base_drifted
candidate.worktree_allocated
candidate.worktree_locked
candidate.environment_preflight_started
candidate.environment_preflight_completed
candidate.plan_frozen
candidate.build_started
candidate.file_changed
candidate.scope_checked
candidate.out_of_scope
candidate.regression_baseline_completed
candidate.regression_candidate_completed
candidate.red_green_proven
candidate.snapshot_created
candidate.evaluation_completed
candidate.review_completed
candidate.impact_report_created
candidate.human_decision_recorded
candidate.cleanup_started
candidate.cleanup_completed
candidate.cleanup_incomplete
~~~

### 27.2 Correlação

Toda cadeia mantém:

~~~text
proposal_id
  -> candidate_id
    -> revision
      -> snapshot_commit
        -> comparison_hash
        -> review_hash
          -> report_hash
            -> decision_id
~~~

### 27.3 Atributos seguros

Registrar:

- IDs e hashes;
- duração;
- contagens;
- status;
- comando_id allowlisted;
- classe de path;
- código de erro;
- decisão resumida.

Não registrar:

- conteúdo integral de código corporativo;
- prompts brutos por padrão;
- secrets;
- valores de env;
- emails, tickets ou notas completos;
- chain-of-thought.

### 27.4 Span hierarchy

~~~mermaid
flowchart TD
    R["candidate.run"] --> W["workspace.prepare"]
    R --> B["candidate.build"]
    R --> E["comparison.evaluate"]
    R --> D["review.and.decision"]
    W --> P["environment.preflight"]
    B --> S["scope.and.snapshot"]
    E --> H["hard.gates"]
~~~

---

## 28. Métricas, evals e gates

### 28.1 Suite mínima da v0.5

| Grupo | Casos mínimos | O que prova |
|---|---:|---|
| Intake | 5 | somente proposta elegível entra |
| Authorization | 7 | escopo, expiração e `--pode-fazer` |
| Base | 5 | SHA imutável e drift |
| Worktree | 8 | isolamento, lock e collision |
| Environment | 6 | setup comparável e sem secrets |
| Scope | 9 | todos os tipos de mudança detectados |
| Regression | 8 | red/green, holdout e golden data |
| Snapshot | 5 | commit imutável e revision |
| Review | 5 | independência e severidade |
| Decision | 7 | nenhuma integração implícita |
| Cleanup | 8 | descarte seguro e idempotente |
| Privacy | 7 | separação personal/ColmeIA |
| Recovery | 6 | retomada após falha |

Total recomendado inicial: 86 casos determinísticos, mais cenários estocásticos do evaluator.

### 28.2 Hard gates

Bloqueiam aceitação:

- qualquer mutação nova no checkout principal;
- qualquer escrita no baseline;
- push, fetch, pull ou remote mutation;
- merge, rebase, cherry-pick ou tag;
- PR ou deploy;
- uso de credencial fora do profile;
- cross-profile leak;
- segredo em diff, trace ou report;
- path fora da allowlist;
- diff budget excedido sem reautorização;
- base SHA divergente;
- avaliação contra working tree não congelada;
- alteração protegida de golden data;
- hard regression;
- P0 ou P1 aberto;
- auto-aceitação;
- cleanup forçado ou amplo;
- resultado sem hashes reproduzíveis.

### 28.3 Métricas

- taxa de candidates com red/green válido;
- regressões encontradas antes da decisão;
- scope violations;
- findings P0–P3;
- taxa de reports inconclusivos;
- tempo e tokens por candidate elegível;
- diferença baseline/candidate;
- reexecuções por flakiness;
- decisões humanas por categoria;
- candidates reabertas;
- cleanup failures;
- violações de isolamento;
- mutações evitadas no checkout principal.

Eficiência é comparada somente após hard gates e qualidade.

---

## 29. Falhas e resiliência

### 29.1 Estados persistentes

~~~mermaid
stateDiagram-v2
    [*] --> Requested
    Requested --> Planned
    Planned --> Authorized
    Authorized --> WorkspaceReady
    WorkspaceReady --> Editing
    Editing --> Frozen
    Frozen --> Evaluated
    Evaluated --> Reviewed
    Reviewed --> AwaitingDecision
    AwaitingDecision --> Terminal
    Editing --> Blocked
    Frozen --> Blocked
    Evaluated --> Blocked
    Blocked --> Editing: retry válido
~~~

Cada transição é persistida antes de iniciar a seguinte. Retomada lê o registry e reconcilia filesystem, Git e manifests.

### 29.2 Matriz de falhas

| Falha | Estado seguro | Resposta |
|---|---|---|
| Queda após criar baseline | registry parcial | reconciliar por path e HEAD |
| Queda após criar branch | branch sem candidate worktree | reutilizar somente se identity/hash bater |
| Disco cheio durante edição | candidate dirty | bloquear, preservar diff, liberar após ação humana |
| Collision de path | nada criado | gerar erro, nunca sobrescrever |
| Lease vencida com processo vivo | estado incerto | bloquear nova escrita e pedir recuperação |
| Setup falha | worktrees intactas | `BlockedByEnvironment` |
| Teste flaky | evidência inconclusiva | rerun dentro do budget e marcar flakiness |
| Scope Guard falha | diff preservado | `OutOfScope`, sem auto-delete |
| Commit falha | candidate editável | não declarar snapshot |
| Review falha | snapshot intacto | retry read-only |
| Report hash diverge | decisão bloqueada | regenerar contra artefatos exatos |
| Cleanup encontra dirty state | nada removido | pedir snapshot/archive ou abandono explícito |
| Worktree registry inconsistente | lock conservador | runbook humano, sem prune genérico |

### 29.3 Idempotência

Operações mutáveis usam idempotency key:

~~~text
<candidate_id>:<revision>:<operation>:<expected_state_hash>
~~~

Retry não pode:

- criar segunda branch silenciosa;
- produzir dois commits para o mesmo freeze;
- remover outro path;
- sobrescrever decisão;
- duplicar evento como nova ação sem relação de retry.

### 29.4 Reconciliação

Na retomada, verificar:

1. repo identity;
2. worktree registry;
3. branch e HEAD;
4. lock reason;
5. lease;
6. dirty state;
7. hashes dos manifests;
8. último evento confirmado.

Se houver ambiguidade, escolher `NeedsHumanRecovery`.

---

## 30. Migração da v0.4

### 30.1 Estratégia aditiva

A v0.5 não reinterpreta propostas antigas. Ela adiciona um consumidor de propostas com decisão `ApprovedForCandidate`.

Compatibilidade:

- propostas rejeitadas continuam rejeitadas;
- propostas aprovadas para estudo não viram candidate automaticamente;
- memória continua com o Curator;
- traces v0.4 continuam legíveis;
- manifests v4 permanecem imutáveis;
- `run_manifest: 5` adiciona campos, sem alterar arquivos anteriores.

### 30.2 Modos de rollout

| Modo | Efeito |
|---|---|
| `disabled` | nenhuma candidate pode ser criada |
| `dry-run` | valida intake, plano e autorização; não cria worktree |
| `shadow` | cria ambiente e compara sem permitir commit de candidate |
| `supervised` | pipeline completo com aprovação em cada gate |

Ordem recomendada: `disabled` → `dry-run` → `shadow` → `supervised`.

### 30.3 Backfill

Não fazer backfill automático de propostas. Para usar uma proposta v0.4 existente:

1. revalidar profile e sensibilidade;
2. confirmar que a versão ainda é atual;
3. resolver repo e base SHA atuais;
4. obter autorização de candidate;
5. criar novo candidate_id.

### 30.4 Rollback de versão

Desabilitar a v0.5:

- impede novas operações mutáveis;
- não apaga candidates;
- preserva leitura, export e recovery;
- mantém locks até decisão segura;
- não tenta “voltar” commits locais automaticamente.

---

## 31. Plano de construção

### Marco 0 — ADRs e ameaça

Entregas:

- ADRs da seção 36;
- threat model de Git/worktree;
- matriz de capacidades;
- runbook de recuperação.

Aceite: nenhuma ambiguidade sobre merge, push, checkout principal ou cleanup.

### Marco 1 — Schemas v5

Entregas:

- schemas strict;
- canonicalização e hashes;
- migração aditiva do Run Manifest;
- fixtures válidas e inválidas.

Aceite: payload desconhecido falha fechado.

### Marco 2 — Intake e autorização

Entregas:

- leitura de Proposal Decision;
- target matrix;
- repo identity;
- base resolver offline;
- autorização com expiração.

Aceite: nenhuma proposta ou SHA divergente passa.

### Marco 3 — Git Read Adapter

Entregas:

- status e fingerprints;
- diff completo, inclusive untracked;
- worktree porcelain parser com NUL;
- merge-base e ref validation.

Aceite: nenhum parsing depende de texto humano/localizado.

### Marco 4 — Worktree Manager

Entregas:

- baseline detached;
- candidate branch namespaced;
- locks e leases;
- collision handling;
- proteção do main checkout.

Aceite: testes de crash e dirty main passam.

### Marco 5 — Environment Preflight

Entregas:

- Environment Manifest;
- setup allowlisted;
- temp/cache isolation;
- network deny;
- detecção de secret e path proibido.

Aceite: baseline e candidate recebem ambiente equivalente.

### Marco 6 — Planner e Scope Guard

Entregas:

- Change Plan freeze;
- path matcher seguro;
- budgets;
- sensitive-path matrix;
- Change Set completo.

Aceite: symlink, binário, untracked e golden mutation são detectados.

### Marco 7 — Restricted Builder

Entregas:

- gate `--pode-fazer`;
- tool capabilities mínimas;
- regression-first workflow;
- iteration log.

Aceite: tentativa de escrita fora do candidate falha antes da ação.

### Marco 8 — Snapshot

Entregas:

- stage de paths explícitos;
- commit local namespaced;
- commit/tree/diff hashes;
- revisions append-only.

Aceite: nenhuma operação remota ou history rewrite disponível.

### Marco 9 — Comparison Runner

Entregas:

- execução baseline/candidate;
- hard gates;
- holdout;
- métricas estocásticas;
- Regression Comparison.

Aceite: variável intencional e drift são explícitos.

### Marco 10 — Review e Impact

Entregas:

- reviewer read-only;
- severity gates;
- Impact Report;
- stale detection.

Aceite: reviewer não consegue editar e report alterado invalida decisão.

### Marco 11 — Decisão e Cleanup

Entregas:

- estados humanos;
- binding a snapshot;
- archive/export;
- cleanup idempotente sem force;
- receipts.

Aceite: aceitar não integra; rejeitar não apaga.

### Marco 12 — Piloto

Piloto com:

- um repo pessoal sintético;
- depois o próprio harness;
- somente depois um repo work.colmeia permitido;
- candidates pequenas;
- todas as aprovações manuais;
- OTel local e redigido.

Saída do piloto: relatório de segurança, ergonomia, custo e falhas reais.

### 31.1 Sequência de PRs sugerida

1. schemas e ADRs;
2. read adapter;
3. repo identity/base resolver;
4. authorization;
5. worktree registry;
6. worktree lifecycle;
7. environment preflight;
8. Change Plan;
9. Scope Guard;
10. restricted builder;
11. snapshot;
12. regression runner;
13. reviewer;
14. Impact Report;
15. human decisions;
16. cleanup/recovery;
17. end-to-end pilot.

Não agrupar tudo em uma única PR.

---

## 32. Riscos e respostas

| Risco | Impacto | Mitigação v0.5 |
|---|---|---|
| Worktree confundida com sandbox | Alto | filesystem policy, adapter estreito e rede negada |
| Main checkout dirty contaminando experimento | Alto | dois worktrees no base SHA, main apenas fingerprint |
| Setup executa código hostil | Alto | setup confiável do base/profile e hash prévio |
| Hooks alteram comportamento | Alto | inventário, hash e sem bypass implícito |
| Scope creep | Alto | plano congelado, allowlist e diff budget |
| Teste criado para aprovar a própria solução | Alto | baseline red, golden protegido e holdout |
| Candidate muda evaluator | Alto | revisão separada e avaliação externa |
| Reviewer replica viés do builder | Médio | execução/contexto separados e decisão humana |
| Aceite interpretado como merge | Alto | estado `AcceptedForManualIntegration` sem operação Git correspondente |
| Cleanup destrutivo | Alto | registry, confirmação, sem force e receipt |
| Branch/ref compartilhado | Alto | namespace e capacidade restrita |
| Dependência ausente gera drift | Médio | Environment Manifest e bloqueio offline |
| Flakiness mascara regressão | Alto | amostras, distribuição e inconclusivo |
| Dados ColmeIA vazam em report | Crítico | storage por profile, redaction e proibição de export bruto |
| Custo de eval cresce | Médio | tiers de suite sem sacrificar hard gates |
| Muitos candidates abandonados | Médio | TTL de aviso e cleanup explícito |
| Base envelhece | Médio | expiração e nova autorização, sem auto-rebase |

---

## 33. Critérios de aceitação

### 33.1 Segurança

- [ ] Checkout principal permanece bit a bit inalterado pelo pipeline.
- [ ] Baseline é read-only e começa limpo.
- [ ] Candidate usa branch local namespaced sem upstream.
- [ ] Network está negada por padrão.
- [ ] Push, merge, rebase, cherry-pick, PR e deploy não existem como capacidades.
- [ ] Common Git dir, hooks e credenciais estão protegidos.
- [ ] Nenhum cleanup usa path livre, glob ou force.
- [ ] Secrets não aparecem em diff, trace ou report.

### 33.2 Autorização

- [ ] Proposal Decision e `--pode-fazer` são verificações diferentes.
- [ ] Autorização está presa a repo, base, paths, budget e expiração.
- [ ] Base drift bloqueia.
- [ ] Expansão de escopo exige nova decisão.
- [ ] Freeze e aceitação são humanas.
- [ ] Aceitação referencia snapshot e report exatos.

### 33.3 Experimento

- [ ] Baseline e candidate partem do mesmo SHA.
- [ ] Environment Manifest é equivalente.
- [ ] Caso causal prova red/green.
- [ ] Golden data e holdout estão protegidos.
- [ ] Hard gates precedem custo.
- [ ] Resultado inconclusivo não vira sucesso.
- [ ] Snapshot é imutável e reproduzível.

### 33.4 Revisão e decisão

- [ ] Reviewer opera read-only.
- [ ] P0/P1 bloqueiam.
- [ ] Impact Report declara limitações.
- [ ] Recomendação e decisão são campos distintos.
- [ ] Request Changes cria nova revision.
- [ ] Rejeição preserva evidência.

### 33.5 Privacidade

- [ ] Personal e work.colmeia usam storage separado.
- [ ] Dados corporativos não entram no harness pessoal.
- [ ] Export corporativo exige sanitização e revisão.
- [ ] Conectores não recebem escrita adicional.
- [ ] Trace segue allowlist de atributos.

### 33.6 Operação

- [ ] Crash recovery é testado.
- [ ] Retries são idempotentes.
- [ ] Collision não sobrescreve worktree.
- [ ] Lease e locks são reconciliáveis.
- [ ] Cleanup Receipt é emitido.
- [ ] Desabilitar v0.5 preserva candidates existentes.

---

## 34. Definition of Done

A v0.5 está pronta quando estes cenários end-to-end passarem:

1. **Caminho feliz:** proposta válida → plano → autorização → red/green → snapshot → review → report → aceitação manual, sem merge.
2. **Main dirty:** usuário possui mudanças locais; candidate nasce do HEAD commit e o estado dirty permanece intocado.
3. **Autorização vencida:** build é bloqueado antes de escrever.
4. **Base drift:** ref humana move; SHA autorizado continua explícito e qualquer troca exige reautorização.
5. **Out of scope:** builder tenta tocar arquivo extra; processo para e preserva evidência.
6. **Hard regression:** métrica secundária melhora, mas policy falha; candidate é bloqueada.
7. **Golden tampering:** expected answer alterado; experimento inválido.
8. **Review crítica:** P1 impede recomendação de aceite.
9. **Request Changes:** revision 2 cria novo snapshot e resultados; decisão da revision 1 não vale.
10. **Rejeição:** candidate é rejeitada sem deleção automática.
11. **Cleanup dirty:** remoção é bloqueada sem archive/abandono explícito.
12. **Crash:** processo morre entre worktree e manifest; retomada reconcilia sem duplicar.
13. **ColmeIA:** trace e report bruto nunca aparecem no storage personal.
14. **Aceite:** não há push, merge, PR ou mutação da branch principal.
15. **Rollback de versão:** modo disabled impede novas mutações e mantém leitura/recovery.

Além disso:

- os 86 casos mínimos passam;
- zero hard gate violation no piloto;
- todos os schemas validam strict;
- manifests permitem reproduzir três candidates amostradas;
- revisão humana confirma que o report é suficiente para decidir;
- custo e latência estão documentados, sem sacrificar qualidade.

---

## 35. Roadmap posterior

### v0.6 — Portabilidade do harness

- formalizar `EnginePort`;
- suportar segundo motor sem enfraquecer policy;
- separar adapter Codex do core;
- empacotamento e instalação;
- migrações de schema;
- import/export seguro de profiles;
- compatibility suite por engine.

### v0.7 — Operação assistida

- fila de candidates;
- budgets e prioridades;
- dashboards;
- reexecução seletiva;
- revisão humana mais ergonômica;
- integração com CI somente read-only inicialmente.

### Fora do compromisso atual

Qualquer merge assistido, criação de PR, push, deploy ou mudança automática de policy exige blueprint e threat model próprios. Não é uma continuação implícita da v0.5.

---

## 36. Decisões registradas

| ADR | Decisão |
|---|---|
| ADR-079 | v0.5 é Controlled Candidate Pipeline |
| ADR-080 | `ApprovedForCandidate` não autoriza escrita |
| ADR-081 | `--pode-fazer` é capability grant escopado |
| ADR-082 | Base é SHA imutável, resolvido sem fetch |
| ADR-083 | Baseline e candidate usam worktrees separadas |
| ADR-084 | Checkout principal nunca recebe escrita da v0.5 |
| ADR-085 | Dirty state do usuário não é copiado |
| ADR-086 | Candidate usa branch local namespaced sem upstream |
| ADR-087 | Worktree não é tratada como sandbox completo |
| ADR-088 | Submodules ficam fora do piloto |
| ADR-089 | Environment Manifest é gate de comparabilidade |
| ADR-090 | Setup confiável vem do base/profile, não do candidate |
| ADR-091 | Rede é negada por padrão |
| ADR-092 | Change Plan congela paths e diff budget |
| ADR-093 | Uma candidate testa uma hipótese principal |
| ADR-094 | Scope Guard inclui untracked, symlink, binário e mode |
| ADR-095 | Golden data é imutável em candidates comuns |
| ADR-096 | Caso causal deve provar baseline red/candidate green |
| ADR-097 | Freeze cria commit local imutável |
| ADR-098 | Revisions são append-only, sem amend ou rebase |
| ADR-099 | Comparação isola a variável intencional |
| ADR-100 | Hard gates precedem métricas de eficiência |
| ADR-101 | Review é execução read-only separada |
| ADR-102 | P0 e P1 bloqueiam candidate |
| ADR-103 | Impact Report recomenda, humano decide |
| ADR-104 | Aceite significa integração manual futura, não merge |
| ADR-105 | Push, PR, merge e deploy não são capacidades da v0.5 |
| ADR-106 | Rejeição não dispara exclusão |
| ADR-107 | Cleanup é explícito, exato, arquivado e sem force |
| ADR-108 | Profiles possuem storage de candidate separado |
| ADR-109 | Memory insight passa pelo Curator |
| ADR-110 | Desabilitar a versão preserva auditabilidade e recovery |

Esses ADRs devem ser ratificados antes do Marco 2. ADRs de ameaça e política precedem código mutável.

---

## 37. Referências

### Codex/OpenAI

- [Codex Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Codex Code Review](https://learn.chatgpt.com/docs/code-review)
- [Local environments](https://learn.chatgpt.com/docs/environments/local-environment)
- [Codex Config Reference](https://learn.chatgpt.com/docs/config-file/config-reference)

### Git

- [git-worktree](https://git-scm.com/docs/git-worktree)
- [git-diff](https://git-scm.com/docs/git-diff)

### MegaBrain

- MegaBrain Blueprint v0.1 — walking skeleton, policy e tracing inicial.
- MegaBrain Blueprint v0.2 — HOT/WARM/FULL e provenance.
- MegaBrain Blueprint v0.3 — integrações read-only e boundaries.
- MegaBrain Blueprint v0.4 — evaluator, trace analyzer e Improvement Proposals.

As referências externas validam capacidades e limites das ferramentas. As policies deste blueprint são deliberadamente mais restritivas.

---

## Conclusão

A v0.5 transforma feedback aprovado em experimento técnico controlado. Ela fecha o espaço entre “temos uma hipótese de melhoria” e “temos um snapshot que um humano pode considerar integrar”.

O desenho exige:

- proposta válida;
- autorização separada para escrita;
- base SHA imutável;
- baseline e candidate isolados;
- ambiente comparável;
- plano congelado;
- regressão causal;
- mudança mínima;
- Scope Guard;
- snapshot imutável;
- comparação reproduzível;
- revisão independente;
- Impact Report;
- decisão humana vinculada a hashes;
- descarte recuperável.

Seu limite é igualmente importante: a v0.5 não faz merge, push, PR ou deploy. Ela produz evidência e um candidate local auditável. O humano continua sendo a única autoridade capaz de decidir se — e como — aquilo entra no sistema real.
