# Arquitetura OonCore

O OonCore é a base para criar Centrais operacionais sob demanda com arquitetura padronizada, segura e evolutiva.

A Central gerada não deve nascer como um sistema completo do zero. Ela deve nascer como uma camada de domínio que consome os recursos do Core.

## Separação de responsabilidades

```txt
Central
├── backend/   domínio, regras, validações, integrações e esteiras
└── frontend/  declaração de telas, coleções, documentos e overrides

OonCore Back
├── boot Express
├── Mongo/Mongoose
├── autenticação
├── RBAC
├── CRUD metadata-driven
├── auditoria
├── triggers/hooks
└── APIs padrão

OonCore Front
├── shell React
├── providers
├── roteamento
├── menu
├── datagrid
├── formulários
├── documentos
├── esteiras
└── SDK REST
```

## Modelo mini-monolítico

Cada Central começa como um mini-monolito de negócio: pequeno, coeso, isolado e capaz de entregar valor rapidamente. Quando uma parte do domínio se tornar reutilizável, crítica ou independente, ela pode evoluir para conector, serviço compartilhado ou micro-serviço.

## Fonte de verdade

- Dados e regras ficam no backend.
- Metadata operacional é exposta pelo backend.
- Frontend renderiza a experiência a partir da metadata.
- Permissões são decididas no backend.
- Integrações são tratadas como conectores, mappings, triggers e esteiras de integração.

## Objetivo do Codex

O Codex deve acelerar a construção da Central usando a arquitetura existente. O objetivo não é gerar um app genérico, mas sim completar a camada de domínio com segurança e aderência ao Core.
