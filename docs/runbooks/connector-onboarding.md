# Onboarding de connector

1. Confirme perfil, conta, tenant, recursos, scopes, finalidade e owner.
2. Crie o binding sem credencial, em `configured`, usando somente `secret_ref` opaco.
3. Descubra o catálogo pelo adapter, revise tool, schema, efeito e mapping e gere o lock.
4. Autentique fora do MegaBrain; verifique fingerprints e scopes exatos.
5. Rode `connector doctor` em shadow, os gates do provider e só então habilite o perfil.

`work.colmeia` exige autorização organizacional documentada fora deste Git. Nunca copie token, endpoint privado, conta ou tenant para templates do core.
