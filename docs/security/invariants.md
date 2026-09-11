# Invariantes e limites de enforcement

| Regra | Enforcement na v0.2-alpha | Limite atual |
|---|---|---|
| Checkpoint é autoridade | Hash, schema estrito, identidade, encadeamento e `current` atômico | Checkpoints locais não são assinados |
| Thread é opcional | Falha de resume cria restore capsule e fallback | Adapter Codex real ainda ausente |
| Plano antes de implementar | Etapa, ator humano, timestamp e hash atual | Aprovação CLI não é assinatura criptográfica |
| WARM ativa exige humano | Candidato pendente separado e review com hash exato | Identidade do usuário é local |
| Memória inativa não entra | Índice contém somente `active`; canônico é revalidado | Relógio local governa validade |
| FULL é read-only | Schema fixa `read_only: true`; adapter só usa leitura/`rg`/Git read-only | Policies YAML sozinhas não criam sandbox |
| Um perfil por run | Diretórios, índice, registry, IDs e pedidos validados por perfil | Proteção contra atacante local depende das ACLs |
| Symlink externo bloqueado | `realpath`, containment e doctor recusam escape | Reparse points incomuns exigem validação adicional |
| Conteúdo não concede autoridade | Itens são `data_not_instructions`; filtros ocorrem antes do ranking | Um modelo real ainda precisa de avaliação adversarial |
| Segredo não persiste em WARM/HOT | Detector bloqueia padrões conhecidos; trace usa allowlist | Redação não detecta todo dado sensível possível |
| Exclusão material | Remove item, revisões, candidatos relacionados e índice; mantém tombstone sem conteúdo | Backups externos não são administrados nesta alpha |
| Memória Codex desligada | Schema/manifest exigem todos os flags falsos | Aplicação ao processo externo depende do futuro wrapper |
| Sem regressão v0.1 | Os 31 testes originais continuam na suíte | Migração automática de estado não foi adicionada |
| Connector pertence a um perfil | Registry e paths físicos validam `profile_id` | ACL contra atacante local continua externa |
| Conta, tenant e scopes conferem | Fingerprints e conjunto exato são verificados antes de `healthy` | Provider real ainda não conectado |
| Capability/tool desconhecida não executa | Catálogo estável, allowlist e default deny | Metadata real de MCP ainda não auditada |
| Drift de catálogo bloqueia | Hash divergente muda connector para `quarantined` | Revisão humana local não é assinatura |
| External result possui proveniência | Output Guard cria external ref antes da persistência | Link/revision dependem do adapter |
| Conteúdo externo não vira WARM | Store de refs guarda metadata/hash separado | Promoção manual continua sob regras v0.2 |
| Credencial não entra no estado/trace | Binding aceita somente `secret_ref` opaco e eventos usam allowlist | OAuth/keyring do host é trabalho futuro |
| Sem fallback externo | Adapter ausente/auth falha fecha a chamada | Disponibilidade pode exigir intervenção humana |
| Escritas proibidas são ausentes | Sem ports/comandos para send, merge, push, transition ou share | Deve ser reconfirmado em transports reais |
| Draft exige payload exato | Receipt W1 por chamada, hash e idempotency key | Fake provider não prova separação Gmail draft/send |
| Anexos são bloqueados | Draft exige tuple vazia; reads só indicam metadata | Parsers reais ainda não implementados |

O estado mutável fica fora do núcleo Git e não aceita raiz dentro de outro repositório. Locks evitam dois escritores cooperativos; publicação por rename impede revisão parcial visível. Não há garantia de fsync contra queda de energia nem proteção contra um usuário local com acesso ao mesmo diretório.

Memória, fontes, comentários de código e Markdown são dados não confiáveis. Nenhum texto recuperado altera profile, policy, modo, aprovação ou capabilities. Essas decisões vêm de entrada explícita e configuração validada antes da busca.
