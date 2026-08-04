# Portal/Cockpit com OonCore

Este padrão atende aplicações como **Meus Apps**, Portal do Cliente, Portal de Parceiros, Suporte, Copilotos e outros Cockpits first-party.

O objetivo é evitar que um portal precise recriar Shell, Router, AuthProvider, Menu, Guards e SDK HTTP. O portal deve usar o `central.ui.json` + `startFromManifest` e registrar apenas os componentes realmente customizados.

## Perfis arquiteturais

O OonCore diferencia três perfis:

| Perfil | Uso |
| --- | --- |
| `root-central` | Central de Ativações, raiz de confiança. |
| `member-central` | Central cliente/licenciada, ativada por instância. |
| `portal-cockpit` | Portal/Cockpit first-party, autenticado por AppClient/BFF. |

## Auth modes

| `auth.mode` | Uso |
| --- | --- |
| `bearer` | Token local simples, compatível com Centrais existentes. |
| `cookie` | Sessão futura via cookie HTTP-only. |
| `external-sso` | Redireciona para login externo. |
| `central-instance` | Central membro usando instância ativada. |
| `central-client` | Portal/Cockpit usando AppClient/BFF. |

## Capabilities no manifesto

Além de `permissions`, o manifesto pode declarar `capabilities`. Elas são permissões dinâmicas vindas da Central de Ativações e evitam criar campos fixos para cada produto.

Exemplos:

```txt
apps:read
users:manage
tickets:read
tickets:assign
copilots:read
copilots:test
billing:read
```

O Core trata `permissions` e `capabilities` como requisitos de UI. A segurança real continua no backend.

## Manifesto recomendado

```json
{
  "schemaVersion": 2,
  "name": "Portal Cliente",
  "slug": "portal-cliente",
  "appKind": "portal-cockpit",
  "auth": {
    "mode": "central-client",
    "tokenParam": "code"
  },
  "layout": {
    "shell": "portal",
    "sidebar": "core",
    "topbar": "none",
    "header": "none",
    "footer": "core"
  },
  "navigation": {
    "mode": "manual",
    "items": [
      { "label": "Meus Apps", "href": "/apps", "capabilities": ["apps:read"], "order": 10 },
      { "label": "Suporte", "href": "/suporte", "capabilities": ["tickets:read"], "order": 20 },
      { "label": "Copilotos", "href": "/copilotos", "capabilities": ["copilots:read"], "order": 30 },
      { "label": "Usuários", "href": "/usuarios", "capabilities": ["users:manage"], "order": 40 }
    ]
  },
  "pages": [
    { "path": "/apps", "label": "Meus Apps", "component": "AppsPortalPage", "capabilities": ["apps:read"] },
    { "path": "/suporte", "label": "Suporte", "component": "SupportPage", "capabilities": ["tickets:read"] },
    { "path": "/copilotos", "label": "Copilotos", "component": "CopilotsPage", "capabilities": ["copilots:read"] },
    { "path": "/usuarios", "label": "Usuários", "component": "UsersPermissionsPage", "capabilities": ["users:manage"] }
  ],
  "collections": [],
  "pipelines": [],
  "documents": []
}
```

## Bootstrap recomendado

```ts
import { startFromManifest } from "@oondemand/oon-core-front";
import manifest from "../central.ui.json";
import { AppsPortalPage } from "./custom/AppsPortalPage";
import { SupportPage } from "./custom/SupportPage";
import { CopilotsPage } from "./custom/CopilotsPage";
import { UsersPermissionsPage } from "./custom/UsersPermissionsPage";

startFromManifest(manifest, {
  apiBaseUrl: import.meta.env.VITE_API_URL,
  appKind: "portal-cockpit",
  auth: {
    mode: "central-client"
  },
  customComponents: {
    AppsPortalPage,
    SupportPage,
    CopilotsPage,
    UsersPermissionsPage
  }
});
```

## Contrato esperado do BFF

O frontend conversa apenas com o BFF do portal. O BFF fala com a Central de Ativações usando AppClient.

Rotas genéricas esperadas no BFF podem espelhar a Central de Ativações:

```http
GET /api/portal/contexto
GET /api/portal/apps
GET /api/portal/apps/:appCode
GET /api/portal/apps/:appCode/capabilities
POST /api/portal/apps/:appCode/authorize
```

O BFF também pode expor rotas de domínio próprias, como:

```http
GET /api/suporte/tickets
POST /api/suporte/tickets
GET /api/copilotos/assistentes
POST /api/copilotos/assistentes/:id/testar
```

Essas rotas de domínio validam capability na Central de Ativações antes de executar a ação.

## Regra de segurança

O frontend nunca deve receber `clientSecret`, `x-oon-instance-token`, hash de credencial ou segredo completo. Portais devem falar com um BFF próprio, e o BFF fala com a Central de Ativações usando AppClient.

## Quando usar página custom

Use página custom apenas quando a tela não for CRUD/esteira/documento declarativo, por exemplo:

- cards de apps licenciados;
- matriz de permissões;
- cockpit de status;
- tickets de suporte;
- gestão de copilotos;
- onboarding orientado por negócio.

Mesmo nesses casos, o Shell, Router, Auth, Menu, Guards e SDK HTTP devem continuar no Core.
