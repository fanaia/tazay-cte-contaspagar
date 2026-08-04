# Conectores e Integrações

Toda integração deve ser modelada como um processo rastreável, não como chamada solta dentro de controller.

## Objetivo

Transformar cada integração em:

```txt
configuração + mapping + execução + status + rastreabilidade
```

## Estrutura recomendada

```txt
backend/src/integrations/
├── <sistema>/
│   ├── client.js
│   ├── mappings/
│   ├── services/
│   └── README.md
```

## Client

O client deve concentrar:

- URL base;
- autenticação;
- headers;
- timeout;
- retry técnico;
- normalização de erro.

Não coloque regra de negócio no client.

## Mapping

Mappings devem transformar dados entre a Central e o sistema externo.

Regras:

- mapping deve ser explícito;
- campos obrigatórios devem ser validados antes do envio;
- resposta externa deve ser normalizada;
- erros devem ser compreensíveis para operação.

## Esteira de integração

Toda integração relevante deve gerar registro operacional com:

- origem;
- destino;
- payload resumido ou referência;
- status;
- tentativas;
- erro normalizado;
- data/hora;
- usuário ou processo responsável.

## Segurança

- Nunca versionar app key, secret, token ou credencial.
- Não logar payloads sensíveis sem necessidade.
- Não expor credenciais no frontend.
- Usar `.env` e configuração de ambiente.
