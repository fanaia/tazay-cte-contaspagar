# Padrões Frontend

O frontend da Central deve ser declarativo. Shell, providers, rotas, menu, datagrid, formulários, documentos, esteiras, modais de detalhe e grids relacionados pertencem ao `@oondemand/oon-core-front`.

Para a lista completa de opções do manifesto, use `FRONTEND_MANIFEST_REFERENCE.md`.
Para UX avançada com abas e itens relacionados, use também `ADVANCED_UX_PATTERNS.md` e `DETAIL_MODAL_AND_RELATED_GRIDS.md`.

## Estrutura esperada

```txt
frontend/
├── central.ui.json
└── src/
    ├── main.tsx
    ├── collections/
    ├── documents/
    ├── pipelines/
    ├── dashboards/
    └── overrides/
```

## central.ui.json

Use `central.ui.json` como entrada principal para declarar:

- menu;
- coleções;
- campos exibidos;
- filtros;
- ações;
- formulários;
- documentos;
- esteiras;
- dashboards;
- agrupamentos;
- layout v2;
- páginas por blocos;
- renderers por chave;
- modais de detalhe;
- abas;
- relações;
- grids relacionados;
- edição inline;
- ações por linha.

## Manifesto v1 e v2

- Manifesto sem `schemaVersion` mantém compatibilidade v1.
- Manifesto com `schemaVersion: 2` habilita composição por `layout`, `navigation`, `pages`, `blocks`, coleções avançadas e componentes declarativos.
- Componentes React não devem ser serializados no JSON; use chaves e registre os componentes no `registry` em TypeScript.

## Padrão de tela operacional

A tela principal de uma coleção operacional deve ser simples:

```txt
Título
Filtros
Busca
Botão novo
Grid principal
Ações por linha
```

Ela não deve acumular detalhe de filhos, formulários longos ou fluxos complexos abaixo do grid. Use `detailModal` para concentrar a operação do registro.

## Padrão de detalhe avançado

Quando a operação envolve um registro principal e seus relacionamentos, use:

```txt
CoreDetailModal
├── Resumo
├── Dados Principais
├── RelatedGrid editável
└── ReadonlyGrid
```

Exemplos:

- Projeto -> Itens -> Pagamentos
- Pedido -> Produtos -> Entregas
- Contrato -> Parcelas -> Documentos
- Cliente -> Atividades -> Histórico

## Formulários agrupados

Campos longos devem ser agrupados por sentido de negócio:

- Identificação;
- Evento/Faturamento;
- Equipe;
- Regras;
- Totais;
- Observações.

Prefira `form.groups` em vez de criar uma tela customizada apenas para organizar campos.

## Grids relacionados

Quando o usuário precisa operar filhos do registro principal, use `relatedGrid`.

Regras:

- Relação deve usar `foreignKey` + `parentKey`.
- Edição inline deve ser usada para ajustes rápidos de muitos itens.
- Ação por linha deve ser declarada como `rowActions`.
- A regra de negócio da ação fica no backend da Central.
- O Core deve executar e atualizar a interface.

## Regras

- Não recrie layout completo se o Core já renderiza.
- Não duplique chamada REST manual se o SDK do Core já atende.
- Não coloque regra de permissão apenas no frontend.
- Não hardcode endpoints quando a metadata puder fornecer.
- Não crie variações visuais fora do padrão sem necessidade real.
- Use overrides pequenos, específicos e documentados.
- Não crie página React customizada para resolver apenas: filtro, modal, abas, agrupamento de campos, grid relacionado ou ação por linha.

## Overrides

Overrides são permitidos para:

- campo especial;
- ação específica;
- card customizado;
- cabeçalho customizado;
- dashboard customizado;
- integração visual pontual;
- aba customizada dentro de `detailModal`.

Overrides não devem virar uma reimplementação do Core.

## Experiência padrão

A Central deve manter o padrão OonCore:

- navegação consistente;
- datagrids densos;
- formulários claros;
- feedback visual;
- status por badges;
- ações rastreáveis;
- responsividade;
- edição inline quando melhora a produtividade;
- detalhe em modal quando o registro possui relações operacionais.

## Contrato avançado implementado

Para telas mestre-detalhe, declare `detailModal` diretamente na coleção. A aba `form` salva o registro principal, `relatedGrid` busca filhos por `foreignKey=parent[parentKey]` e permite edição inline quando `editable: true` e `editMode: "inline"`, e `readonlyGrid` lista relações sem edição. Use `refresh` nas ações para coordenar recarga de `self`, `parent`, `all` ou abas específicas.
