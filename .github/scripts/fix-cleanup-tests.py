from pathlib import Path

path = Path("backend/test/agrupamentoExclusao.test.js")
source = path.read_text()
source = source.replace(
    '  assert.equal(conta.list.rowActions.some((action) => action.method === "DELETE" && action.label === "🗑️"), true);',
    '  assert.equal(conta.list.rowActions.some((action) => (\n    action.method === "DELETE"\n    && action.label === "Excluir conta"\n    && action.icon === "trash"\n    && action.iconOnly === true\n  )), true);',
)
path.write_text(source)

path = Path("backend/test/sidecarAutomatico.test.js")
source = path.read_text()
source = source.replace(
    '  assert.equal(conta.list.rowActions[0].label, "🗑️");',
    '  assert.equal(conta.list.rowActions[0].label, "Excluir conta");\n  assert.equal(conta.list.rowActions[0].icon, "trash");\n  assert.equal(conta.list.rowActions[0].iconOnly, true);',
)
path.write_text(source)
