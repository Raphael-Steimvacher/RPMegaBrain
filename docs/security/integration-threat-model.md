# Threat model de integrações v0.3

O core e o Policy Gateway são a fronteira confiável. Adapter revisado é confiança condicional; MCP/API, metadata remota e conteúdo retornado são externos. O provider é autoridade do dado e da conta, nunca de policy.

Os ativos protegidos são identidade de conta/tenant, credenciais, conteúdo privado, separação de perfis, autorizações humanas e integridade do catálogo. Os principais ataques são confused deputy, prompt injection, egress entre sistemas, troca de conta, ampliação de scope, schema poisoning, output excessivo e replay de escrita.

Controles implementados:

- binding físico por perfil e fingerprints de conta/tenant;
- scopes exatos, capability e resource allowlists;
- catálogo hashado com quarentena por drift;
- default deny e ausência estrutural de send/merge/push/comment/share;
- approval de draft por hash e idempotency key;
- sanitização HTML, campos/paginação/output limitados e envelope `untrusted_content`;
- refs sem corpo bruto e traces allowlisted/redigidos;
- nenhum fallback de conta, provider privado ou adapter;
- fixtures sintéticas adversariais, sem credenciais reais.

Limites: os adapters atuais são falsos e offline. Assim, a suíte prova enforcement do harness, não scopes, sandbox, autenticação ou comportamento de um provider/MCP real.
