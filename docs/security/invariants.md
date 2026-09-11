# Invariantes e limites de enforcement

| Regra | Enforcement nesta alpha | Limite |
|---|---|---|
| Teach por padrão | Parser + resolveMode; review volta a teach | Mock não tem ferramentas |
| Plano antes de implementar | Etapa + ator humano + timestamp + hash atual | Aprovação é entrada CLI, não assinatura criptográfica |
| Um perfil ativo | CLI aceita somente synthetic; manifest valida perfil | Overlays reais ainda não são carregados |
| Fonte fora da allowlist bloqueada | Função requireSource com teste adversarial | Não há retrieval ainda |
| Modelo não concede permissões | Opções CLI fora do conteúdo da tarefa | Validar novamente com modelo real |
| Estado fora do Git | Verificação de ancestrais, UUID e recusa de symlink/junction | Não protege contra atacante local com acesso concorrente ao disco |
| Trace sem conteúdo bruto | Allowlist de atributos e redação; nunca serializar erros brutos | Redactor não detecta todos os segredos possíveis |
| Sem falso teste aprovado | Mock marcado; verificação declara somente integridade do plano | Verificação real pertence ao Marco 5 |
| Falhas graves impedem aceitação | Condição no JSON Schema de avaliação | Detecção automática de todas as falhas ainda não existe |
| Retomada sem corrupção silenciosa | Revisões imutáveis, lock e validação de identidades/sequência | fsync/queda de energia e migração de schema pendentes |
| Sem ações externas | Nenhuma ferramenta ou adapter externo no mock | Validar rede, shell e MCP antes do Codex |

As policies YAML expressam o contrato pretendido. Não constituem sandbox. A v0.1 real deve comprovar restrições de escrita e de leitura independentemente da obediência ao prompt. Contexto marcado como não confiável reduz ambiguidade; sozinho não impede prompt injection.
