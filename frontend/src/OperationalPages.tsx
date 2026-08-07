import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  NativeSelect,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOonApi } from "@oondemand/oon-core-front";

type DocumentoFiscal = {
  _id: string;
  numeroDocumentoFiscal?: string;
  tipoDocumentoFiscal?: string;
  nomeFornecedor?: string;
  valorFaturado?: number;
  statusDocumentoOmie?: string;
  etapa?: string;
  statusAprovacao?: string;
  statusIntegracao?: string;
  dataVencimento?: string;
  contaPagarId?: string | { _id?: string };
  acaoAprovacaoManualDisponivel?: boolean;
};

type ContaPagar = {
  _id: string;
  nomeFornecedor?: string;
  tipoDocumentoFiscal?: string;
  dataVencimento?: string;
  quantidadeCompras?: number;
  valorTotal?: number;
  nomeCategoriaOmie?: string;
  nomeContaCorrenteOmie?: string;
  statusEnvioOmie?: string;
  statusPagamentoOmie?: string;
  status?: string;
  codigoLancamentoIntegracao?: string;
  codigoLancamentoOmie?: number;
  acaoSincronizacaoManualDisponivel?: boolean;
};

type Paginated<T> = {
  results: T[];
  pagination: {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    totalPages: number;
  };
};

type PaymentContext = {
  fornecedor: { codigo: number; nome: string; tipoDocumentoFiscal: string };
  documentos: Array<{
    _id: string;
    numeroDocumentoFiscal: string;
    tipoDocumentoFiscal: string;
    valorFaturado: number;
    dataVencimento?: string;
  }>;
  valorTotal: number;
  dataVencimento: string;
  contasAbertas: Array<{
    _id: string;
    codigoLancamentoOmie?: number;
    codigoLancamentoIntegracao?: string;
    dataVencimento: string;
    valorTotal: number;
    quantidadeCompras: number;
    status: string;
    categoriaOmieId?: string;
    contaCorrenteOmieId?: string;
  }>;
  categorias: Array<{ _id: string; codigo: string; nome: string }>;
  contasCorrentes: Array<{ _id: string; codigo: number; nome: string }>;
  defaults: { categoriaId?: string; contaCorrenteId?: string; dataVencimento: string };
};

type AccountDetail = {
  conta: ContaPagar;
  documentos: DocumentoFiscal[];
};

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function money(value: unknown) {
  return dinheiro.format(Number(value || 0));
}

function errorMessage(error: unknown) {
  const candidate = error as {
    response?: { data?: { message?: string; error?: { message?: string } } };
    message?: string;
  };
  return candidate?.response?.data?.error?.message
    || candidate?.response?.data?.message
    || candidate?.message
    || "Não foi possível concluir a operação.";
}

function statusPalette(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (/erro|cancel|recus|exclu/.test(text)) return "red";
  if (/pendente|aguardando|não enviado|consultando/.test(text)) return "orange";
  if (/aprov|aberta|enviado|sincronizado|pago|conclu/.test(text)) return "green";
  return "gray";
}

function Status({ children }: { children: unknown }) {
  return (
    <Badge colorPalette={statusPalette(children)} variant="subtle" borderRadius="full" px="8px" py="3px" fontSize="10px">
      {String(children || "—")}
    </Badge>
  );
}

function PageHeader({ section, title, description }: { section: string; title: string; description: string }) {
  return (
    <Box>
      <Text fontSize="11px" fontWeight="700" color="brand.500" textTransform="uppercase" letterSpacing="0.08em" mb={1}>
        {section}
      </Text>
      <Heading size="lg" color="#24323A" letterSpacing="-0.02em">{title}</Heading>
      <Text mt={1} fontSize="13px" color="gray.500">{description}</Text>
    </Box>
  );
}

function Message({ text, tone = "red" }: { text: string; tone?: "red" | "green" | "blue" }) {
  if (!text) return null;
  return (
    <Box px="12px" py="9px" borderRadius="7px" bg={`${tone}.50`} color={`${tone}.700`} fontSize="11px" borderWidth="1px" borderColor={`${tone}.100`}>
      {text}
    </Box>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Box position="fixed" inset={0} zIndex={1600} bg="rgba(15,23,42,.48)" p={{ base: 2, md: 6 }} overflowY="auto">
      <Box maxW="980px" mx="auto" my={{ base: 0, md: 8 }} bg="white" borderRadius="12px" boxShadow="0 24px 70px rgba(15,23,42,.28)" overflow="hidden">
        <Flex px="18px" py="14px" justify="flex-end" borderBottomWidth="1px" borderColor="#E5E9ED">
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
        </Flex>
        {children}
      </Box>
    </Box>
  );
}

function Pagination({ page, totalPages, totalItems, onChange }: { page: number; totalPages: number; totalItems: number; onChange: (page: number) => void }) {
  return (
    <Flex px="14px" py="10px" justify="flex-end" align="center" gap={3} borderTopWidth="1px" borderColor="#E5E9ED" fontSize="11px" color="#667085">
      <Text>{totalItems} registro{totalItems === 1 ? "" : "s"}</Text>
      <Button size="xs" variant="outline" disabled={page <= 0} onClick={() => onChange(page - 1)}>Anterior</Button>
      <Text>{Math.min(page + 1, totalPages)} / {Math.max(totalPages, 1)}</Text>
      <Button size="xs" variant="outline" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>Próxima</Button>
    </Flex>
  );
}

export function DocumentosFiscaisPage() {
  const { http } = useOonApi();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [paymentContext, setPaymentContext] = useState<PaymentContext | null>(null);
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [loadingPayment, setLoadingPayment] = useState(false);

  const query = useQuery({
    queryKey: ["tazay", "documentos-fiscais", page, search, approvalFilter],
    queryFn: async () => {
      const response = await http.get<Paginated<DocumentoFiscal>>("/api/tazay/contas-pagar/documentos-fiscais", {
        params: { pageIndex: page, pageSize: 50, searchTerm: search || undefined, statusAprovacao: approvalFilter || undefined },
      });
      return response.data;
    },
  });

  const refresh = async () => {
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ["tazay", "documentos-fiscais"] });
    await queryClient.invalidateQueries({ queryKey: ["tazay", "contas-pagar"] });
  };

  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => (await http.post("/api/tazay/contas-pagar/compras/aprovar-lote", { ids })).data,
    onSuccess: async (result: { aprovados?: number; jaAprovados?: string[] }) => {
      setMessage(`${Number(result.aprovados || 0)} documento(s) aprovado(s).`);
      await refresh();
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => (await http.post(`/api/tazay/contas-pagar/compras/${id}/recusar`)).data,
    onSuccess: async () => {
      setMessage("Documento recusado e enviado para processamento no Omie.");
      await refresh();
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const openPayment = async (ids: string[]) => {
    setMessage("");
    setLoadingPayment(true);
    try {
      const response = await http.post<PaymentContext>("/api/tazay/contas-pagar/compras/contexto-pagamento", { ids });
      setPaymentIds(ids);
      setPaymentContext(response.data);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoadingPayment(false);
    }
  };

  const rows = query.data?.results ?? [];
  const allCurrentSelected = rows.length > 0 && rows.every((row) => selected.has(row._id));
  const selectedIds = [...selected];

  const toggleAll = () => {
    if (allCurrentSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((row) => row._id)));
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Stack gap={5}>
      <PageHeader section="Operação" title="Documentos fiscais" description="Aprove os documentos e gere os pagamentos agrupados em etapas independentes." />
      <Message text={message} tone={message.includes("aprovado") || message.includes("recusado") ? "green" : "red"} />

      <Box bg="white" borderWidth="1px" borderColor="#E5E9ED" borderRadius="10px" overflow="hidden">
        <Flex minH="60px" px="14px" py="12px" align="center" gap={3} borderBottomWidth="1px" borderColor="#E5E9ED" flexWrap="wrap">
          <Input
            maxW="390px"
            h="35px"
            fontSize="11px"
            placeholder="Pesquisar documento ou fornecedor..."
            value={search}
            onChange={(event) => { setSearch(event.currentTarget.value); setPage(0); setSelected(new Set()); }}
          />
          <NativeSelect.Root size="xs" w="180px">
            <NativeSelect.Field value={approvalFilter} onChange={(event) => { setApprovalFilter(event.currentTarget.value); setPage(0); setSelected(new Set()); }}>
              <option value="">Todas as aprovações</option>
              <option value="Pendente">Pendente</option>
              <option value="Aprovada">Aprovada</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Flex flex="1" />
          {selectedIds.length ? <Text fontSize="11px" color="#667085">{selectedIds.length} selecionado(s)</Text> : null}
          <Button size="sm" variant="outline" disabled={!selectedIds.length || approveMutation.isPending} onClick={() => approveMutation.mutate(selectedIds)}>
            Aprovar selecionados
          </Button>
          <Button size="sm" colorPalette="blue" disabled={!selectedIds.length || loadingPayment} onClick={() => openPayment(selectedIds)}>
            {loadingPayment ? <Spinner size="xs" /> : null} Gerar contas a pagar
          </Button>
        </Flex>

        {query.isLoading ? (
          <Flex minH="220px" align="center" justify="center"><Spinner /></Flex>
        ) : query.isError ? (
          <Box p={4}><Message text={errorMessage(query.error)} /></Box>
        ) : (
          <Box overflowX="auto">
            <Table.Root size="sm" minW="1180px">
              <Table.Header>
                <Table.Row bg="#F4F7F9">
                  <Table.ColumnHeader w="38px"><input type="checkbox" aria-label="Selecionar todos" checked={allCurrentSelected} onChange={toggleAll} /></Table.ColumnHeader>
                  <Table.ColumnHeader minW="245px">Ações</Table.ColumnHeader>
                  <Table.ColumnHeader>Documento</Table.ColumnHeader>
                  <Table.ColumnHeader>Tipo</Table.ColumnHeader>
                  <Table.ColumnHeader>Fornecedor</Table.ColumnHeader>
                  <Table.ColumnHeader textAlign="right">Valor</Table.ColumnHeader>
                  <Table.ColumnHeader>Aprovação</Table.ColumnHeader>
                  <Table.ColumnHeader>Pagamento</Table.ColumnHeader>
                  <Table.ColumnHeader>Vencimento</Table.ColumnHeader>
                  <Table.ColumnHeader>Integração</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => {
                  const linked = Boolean(typeof row.contaPagarId === "string" ? row.contaPagarId : row.contaPagarId?._id);
                  const canGenerate = row.statusAprovacao === "Aprovada" && !linked && row.etapa === "Faturado pelo fornecedor" && row.statusDocumentoOmie === "Pendente";
                  return (
                    <Table.Row key={row._id} _hover={{ bg: "#F8FBFE" }}>
                      <Table.Cell><input type="checkbox" aria-label={`Selecionar ${row.numeroDocumentoFiscal || row._id}`} checked={selected.has(row._id)} onChange={() => toggleOne(row._id)} /></Table.Cell>
                      <Table.Cell>
                        <Flex gap="5px" flexWrap="wrap">
                          {row.acaoAprovacaoManualDisponivel ? (
                            <Button size="xs" colorPalette="green" variant="subtle" onClick={() => approveMutation.mutate([row._id])}>Aprovar</Button>
                          ) : null}
                          {row.acaoAprovacaoManualDisponivel ? (
                            <Button size="xs" colorPalette="red" variant="subtle" onClick={() => {
                              if (window.confirm("Recusar este documento fiscal e excluir o recebimento no Omie?")) rejectMutation.mutate(row._id);
                            }}>Recusar</Button>
                          ) : null}
                          {canGenerate ? (
                            <Button size="xs" colorPalette="blue" variant="subtle" onClick={() => openPayment([row._id])}>Gerar pagamento</Button>
                          ) : null}
                          {!row.acaoAprovacaoManualDisponivel && !canGenerate ? <Text fontSize="10px" color="#98A2B3">Sem ação pendente</Text> : null}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell fontWeight="600">{row.numeroDocumentoFiscal || "—"}</Table.Cell>
                      <Table.Cell>{row.tipoDocumentoFiscal || "—"}</Table.Cell>
                      <Table.Cell maxW="260px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{row.nomeFornecedor || "—"}</Table.Cell>
                      <Table.Cell textAlign="right">{money(row.valorFaturado)}</Table.Cell>
                      <Table.Cell><Status>{row.statusAprovacao}</Status></Table.Cell>
                      <Table.Cell><Status>{linked ? "Agrupado" : row.statusAprovacao === "Aprovada" ? "Aguardando geração" : "Aguardando aprovação"}</Status></Table.Cell>
                      <Table.Cell>{row.dataVencimento || "—"}</Table.Cell>
                      <Table.Cell><Status>{row.statusIntegracao}</Status></Table.Cell>
                    </Table.Row>
                  );
                })}
                {!rows.length ? (
                  <Table.Row><Table.Cell colSpan={10}><Text py={10} textAlign="center" color="#98A2B3">Nenhum documento encontrado.</Text></Table.Cell></Table.Row>
                ) : null}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
        <Pagination
          page={page}
          totalPages={query.data?.pagination.totalPages || 1}
          totalItems={query.data?.pagination.totalItems || 0}
          onChange={(next) => { setPage(next); setSelected(new Set()); }}
        />
      </Box>

      {paymentContext ? (
        <PaymentConfirmation
          context={paymentContext}
          ids={paymentIds}
          onClose={() => { setPaymentContext(null); setPaymentIds([]); }}
          onCompleted={async (text) => {
            setPaymentContext(null);
            setPaymentIds([]);
            setMessage(text);
            await refresh();
          }}
        />
      ) : null}
    </Stack>
  );
}

function PaymentConfirmation({ context, ids, onClose, onCompleted }: {
  context: PaymentContext;
  ids: string[];
  onClose: () => void;
  onCompleted: (message: string) => Promise<void>;
}) {
  const { http } = useOonApi();
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState(context.defaults.categoriaId || "");
  const [currentAccountId, setCurrentAccountId] = useState(context.defaults.contaCorrenteId || "");
  const [dueDate, setDueDate] = useState(context.defaults.dataVencimento || context.dataVencimento);
  const [message, setMessage] = useState("");

  const mutation = useMutation({
    mutationFn: async () => (await http.post("/api/tazay/contas-pagar/compras/gerar-pagamento", {
      ids,
      contaPagarId: accountId || undefined,
      categoriaId: categoryId || undefined,
      contaCorrenteId: currentAccountId || undefined,
      dataVencimento: dueDate,
    })).data,
    onSuccess: async (result: { contaExistente?: boolean; documentosIncluidos?: number; valorTotal?: number }) => {
      await onCompleted(`${Number(result.documentosIncluidos || ids.length)} documento(s) incluído(s) ${result.contaExistente ? "no pagamento selecionado" : "em um novo pagamento"}, total ${money(result.valorTotal)}.`);
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const chooseAccount = (id: string) => {
    setAccountId(id);
    if (!id) {
      setCategoryId(context.defaults.categoriaId || "");
      setCurrentAccountId(context.defaults.contaCorrenteId || "");
      setDueDate(context.defaults.dataVencimento || context.dataVencimento);
      return;
    }
    const account = context.contasAbertas.find((item) => item._id === id);
    if (!account) return;
    setCategoryId(account.categoriaOmieId || context.defaults.categoriaId || "");
    setCurrentAccountId(account.contaCorrenteOmieId || context.defaults.contaCorrenteId || "");
    setDueDate(account.dataVencimento || context.dataVencimento);
  };

  return (
    <Overlay onClose={onClose}>
      <Stack p={{ base: 4, md: 6 }} gap={5}>
        <Box>
          <Text fontSize="11px" fontWeight="700" color="brand.500" textTransform="uppercase">Confirmação</Text>
          <Heading size="md" mt={1}>Gerar contas a pagar</Heading>
          <Text mt={1} fontSize="12px" color="#667085">Revise os documentos, escolha o destino e confirme os parâmetros financeiros.</Text>
        </Box>
        <Message text={message} />

        <Flex gap={4} flexWrap="wrap">
          <Box flex="1" minW="230px" p={3} bg="#F8FAFC" borderRadius="8px">
            <Text fontSize="10px" color="#667085">Fornecedor</Text>
            <Text fontWeight="600" fontSize="13px">{context.fornecedor.nome}</Text>
            <Text fontSize="11px" color="#667085">{context.fornecedor.tipoDocumentoFiscal} · código {context.fornecedor.codigo}</Text>
          </Box>
          <Box minW="190px" p={3} bg="#F8FAFC" borderRadius="8px">
            <Text fontSize="10px" color="#667085">Documentos / total</Text>
            <Text fontWeight="700" fontSize="16px">{context.documentos.length} · {money(context.valorTotal)}</Text>
          </Box>
        </Flex>

        <Box>
          <Text fontSize="12px" fontWeight="700" mb={2}>Destino do pagamento</Text>
          <Stack gap={2}>
            <Box as="label" display="flex" gap={2} alignItems="center" p={3} borderWidth="1px" borderColor={!accountId ? "blue.300" : "#E5E9ED"} borderRadius="8px" cursor="pointer">
              <input type="radio" name="payment-account" checked={!accountId} onChange={() => chooseAccount("")} />
              <Box><Text fontWeight="600" fontSize="12px">Criar um novo contas a pagar</Text><Text fontSize="10px" color="#667085">Gera um novo agrupamento para estes documentos.</Text></Box>
            </Box>
            {context.contasAbertas.map((account) => (
              <Box key={account._id} as="label" display="flex" gap={2} alignItems="center" p={3} borderWidth="1px" borderColor={accountId === account._id ? "blue.300" : "#E5E9ED"} borderRadius="8px" cursor="pointer">
                <input type="radio" name="payment-account" checked={accountId === account._id} onChange={() => chooseAccount(account._id)} />
                <Flex flex="1" justify="space-between" gap={4} flexWrap="wrap">
                  <Box>
                    <Text fontWeight="600" fontSize="12px">{account.codigoLancamentoOmie ? `Omie #${account.codigoLancamentoOmie}` : account.codigoLancamentoIntegracao}</Text>
                    <Text fontSize="10px" color="#667085">Vence {account.dataVencimento} · {account.quantidadeCompras} documento(s)</Text>
                  </Box>
                  <Box textAlign="right"><Text fontWeight="600" fontSize="12px">{money(account.valorTotal)}</Text><Status>{account.status}</Status></Box>
                </Flex>
              </Box>
            ))}
          </Stack>
        </Box>

        <Flex gap={4} flexWrap="wrap">
          <Box flex="1" minW="240px">
            <Text mb={1} fontSize="11px" fontWeight="600">Categoria</Text>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)}>
                <option value="">Selecione...</option>
                {context.categorias.map((item) => <option key={item._id} value={item._id}>{item.codigo} — {item.nome}</option>)}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
          <Box flex="1" minW="240px">
            <Text mb={1} fontSize="11px" fontWeight="600">Conta corrente</Text>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field value={currentAccountId} onChange={(event) => setCurrentAccountId(event.currentTarget.value)}>
                <option value="">Selecione...</option>
                {context.contasCorrentes.map((item) => <option key={item._id} value={item._id}>{item.codigo} — {item.nome}</option>)}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
          <Box minW="190px">
            <Text mb={1} fontSize="11px" fontWeight="600">Data de vencimento</Text>
            <Input type="date" size="sm" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
          </Box>
        </Flex>

        <Box overflowX="auto" borderWidth="1px" borderColor="#E5E9ED" borderRadius="8px">
          <Table.Root size="sm">
            <Table.Header><Table.Row bg="#F4F7F9"><Table.ColumnHeader>Documento</Table.ColumnHeader><Table.ColumnHeader>Tipo</Table.ColumnHeader><Table.ColumnHeader textAlign="right">Valor</Table.ColumnHeader></Table.Row></Table.Header>
            <Table.Body>
              {context.documentos.map((item) => <Table.Row key={item._id}><Table.Cell>{item.numeroDocumentoFiscal}</Table.Cell><Table.Cell>{item.tipoDocumentoFiscal}</Table.Cell><Table.Cell textAlign="right">{money(item.valorFaturado)}</Table.Cell></Table.Row>)}
            </Table.Body>
          </Table.Root>
        </Box>

        <Flex justify="flex-end" gap={3}>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button colorPalette="blue" disabled={!dueDate || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Spinner size="xs" /> : null} Confirmar geração
          </Button>
        </Flex>
      </Stack>
    </Overlay>
  );
}

export function ContasPagarPage() {
  const { http } = useOonApi();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["tazay", "contas-pagar", page, search],
    queryFn: async () => (await http.get<Paginated<ContaPagar>>("/api/tazay/contas-pagar/contas", {
      params: { pageIndex: page, pageSize: 50, searchTerm: search || undefined },
    })).data,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tazay", "contas-pagar"] });
    await queryClient.invalidateQueries({ queryKey: ["tazay", "documentos-fiscais"] });
    if (detailId) await queryClient.invalidateQueries({ queryKey: ["tazay", "conta-detalhe", detailId] });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ method, id }: { method: "send" | "check" | "delete"; id: string }) => {
      if (method === "send") return (await http.post(`/api/tazay/contas-pagar/contas/${id}/enviar`)).data;
      if (method === "check") return (await http.post(`/api/tazay/contas-pagar/contas/${id}/consultar-pagamento`)).data;
      return (await http.delete(`/api/tazay/contas-pagar/contas/${id}`)).data;
    },
    onSuccess: async () => { setMessage("Operação enviada para processamento."); await refresh(); },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const rows = query.data?.results ?? [];

  return (
    <Stack gap={5}>
      <PageHeader section="Financeiro" title="Contas a pagar agrupadas" description="Acompanhe os pagamentos e consulte os documentos fiscais que compõem cada agrupamento." />
      <Message text={message} tone={message.includes("enviada") ? "green" : "red"} />
      <Box bg="white" borderWidth="1px" borderColor="#E5E9ED" borderRadius="10px" overflow="hidden">
        <Flex minH="60px" px="14px" py="12px" align="center" gap={3} borderBottomWidth="1px" borderColor="#E5E9ED">
          <Input maxW="400px" h="35px" fontSize="11px" placeholder="Pesquisar fornecedor, status ou lançamento..." value={search} onChange={(event) => { setSearch(event.currentTarget.value); setPage(0); }} />
        </Flex>
        {query.isLoading ? <Flex minH="220px" align="center" justify="center"><Spinner /></Flex> : query.isError ? <Box p={4}><Message text={errorMessage(query.error)} /></Box> : (
          <Box overflowX="auto">
            <Table.Root size="sm" minW="1250px">
              <Table.Header><Table.Row bg="#F4F7F9">
                <Table.ColumnHeader minW="300px">Ações</Table.ColumnHeader>
                <Table.ColumnHeader>Fornecedor</Table.ColumnHeader>
                <Table.ColumnHeader>Tipo</Table.ColumnHeader>
                <Table.ColumnHeader>Vencimento</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Documentos</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Valor</Table.ColumnHeader>
                <Table.ColumnHeader>Categoria</Table.ColumnHeader>
                <Table.ColumnHeader>Conta corrente</Table.ColumnHeader>
                <Table.ColumnHeader>Envio</Table.ColumnHeader>
                <Table.ColumnHeader>Pagamento</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
              </Table.Row></Table.Header>
              <Table.Body>
                {rows.map((row) => {
                  const inactive = ["Paga", "Excluída", "Exclusão pendente"].includes(String(row.status));
                  const canCheck = row.acaoSincronizacaoManualDisponivel && row.statusEnvioOmie === "Enviado" && !inactive;
                  const canSend = row.acaoSincronizacaoManualDisponivel && !inactive;
                  return <Table.Row key={row._id} _hover={{ bg: "#F8FBFE" }}>
                    <Table.Cell><Flex gap="5px" flexWrap="wrap">
                      <Button size="xs" variant="outline" onClick={() => setDetailId(row._id)}>Detalhes</Button>
                      {canSend ? <Button size="xs" colorPalette="blue" variant="subtle" onClick={() => actionMutation.mutate({ method: "send", id: row._id })}>Enviar para Omie</Button> : null}
                      {canCheck ? <Button size="xs" colorPalette="green" variant="subtle" onClick={() => actionMutation.mutate({ method: "check", id: row._id })}>Verificar pagamento</Button> : null}
                      {!inactive ? <Button size="xs" colorPalette="red" variant="subtle" onClick={() => { if (window.confirm("Excluir esta conta a pagar?")) actionMutation.mutate({ method: "delete", id: row._id }); }}>Excluir</Button> : null}
                    </Flex></Table.Cell>
                    <Table.Cell maxW="260px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontWeight="600">{row.nomeFornecedor || "—"}</Table.Cell>
                    <Table.Cell>{row.tipoDocumentoFiscal || "—"}</Table.Cell>
                    <Table.Cell>{row.dataVencimento || "—"}</Table.Cell>
                    <Table.Cell textAlign="right">{Number(row.quantidadeCompras || 0)}</Table.Cell>
                    <Table.Cell textAlign="right" fontWeight="600">{money(row.valorTotal)}</Table.Cell>
                    <Table.Cell>{row.nomeCategoriaOmie || "—"}</Table.Cell>
                    <Table.Cell>{row.nomeContaCorrenteOmie || "—"}</Table.Cell>
                    <Table.Cell><Status>{row.statusEnvioOmie}</Status></Table.Cell>
                    <Table.Cell><Status>{row.statusPagamentoOmie}</Status></Table.Cell>
                    <Table.Cell><Status>{row.status}</Status></Table.Cell>
                  </Table.Row>;
                })}
                {!rows.length ? <Table.Row><Table.Cell colSpan={11}><Text py={10} textAlign="center" color="#98A2B3">Nenhuma conta encontrada.</Text></Table.Cell></Table.Row> : null}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
        <Pagination page={page} totalPages={query.data?.pagination.totalPages || 1} totalItems={query.data?.pagination.totalItems || 0} onChange={setPage} />
      </Box>

      {detailId ? <AccountDetailModal accountId={detailId} onClose={() => setDetailId(null)} onChanged={refresh} /> : null}
    </Stack>
  );
}

function AccountDetailModal({ accountId, onClose, onChanged }: { accountId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const { http } = useOonApi();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["tazay", "conta-detalhe", accountId],
    queryFn: async () => (await http.get<AccountDetail>(`/api/tazay/contas-pagar/contas/${accountId}/documentos`)).data,
  });

  const removeMutation = useMutation({
    mutationFn: async (documentId: string) => (await http.delete(`/api/tazay/contas-pagar/contas/${accountId}/documentos/${documentId}`)).data,
    onSuccess: async (result: { contaExcluida?: boolean }) => {
      setMessage("Documento removido do pagamento e liberado para uma nova geração.");
      await queryClient.invalidateQueries({ queryKey: ["tazay", "conta-detalhe", accountId] });
      await onChanged();
      if (result.contaExcluida) onClose();
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const conta = query.data?.conta;
  const documentos = query.data?.documentos ?? [];
  const paid = conta?.status === "Paga" || conta?.statusPagamentoOmie === "Pago";

  return (
    <Overlay onClose={onClose}>
      <Stack p={{ base: 4, md: 6 }} gap={5}>
        <Box>
          <Text fontSize="11px" fontWeight="700" color="brand.500" textTransform="uppercase">Conta a pagar agrupada</Text>
          <Heading size="md" mt={1}>{conta?.nomeFornecedor || "Detalhes do pagamento"}</Heading>
          <Text mt={1} fontSize="12px" color="#667085">Visualize a composição e retire documentos quando o pagamento ainda estiver aberto.</Text>
        </Box>
        <Message text={message} tone={message.includes("removido") ? "green" : "red"} />
        {query.isLoading ? <Flex minH="220px" align="center" justify="center"><Spinner /></Flex> : query.isError ? <Message text={errorMessage(query.error)} /> : conta ? (
          <>
            <Flex gap={3} flexWrap="wrap">
              {[
                ["Vencimento", conta.dataVencimento || "—"],
                ["Valor total", money(conta.valorTotal)],
                ["Documentos", String(conta.quantidadeCompras || 0)],
                ["Status", conta.status || "—"],
                ["Envio Omie", conta.statusEnvioOmie || "—"],
                ["Pagamento", conta.statusPagamentoOmie || "—"],
              ].map(([label, value]) => <Box key={label} minW="145px" flex="1" p={3} bg="#F8FAFC" borderRadius="8px"><Text fontSize="9px" color="#667085">{label}</Text><Text mt={1} fontSize="12px" fontWeight="600">{value}</Text></Box>)}
            </Flex>
            <Box>
              <Text fontSize="12px" fontWeight="700" mb={2}>Documentos fiscais relacionados</Text>
              <Box overflowX="auto" borderWidth="1px" borderColor="#E5E9ED" borderRadius="8px">
                <Table.Root size="sm" minW="780px">
                  <Table.Header><Table.Row bg="#F4F7F9"><Table.ColumnHeader minW="150px">Ações</Table.ColumnHeader><Table.ColumnHeader>Documento</Table.ColumnHeader><Table.ColumnHeader>Tipo</Table.ColumnHeader><Table.ColumnHeader textAlign="right">Valor</Table.ColumnHeader><Table.ColumnHeader>Aprovação</Table.ColumnHeader><Table.ColumnHeader>Integração</Table.ColumnHeader></Table.Row></Table.Header>
                  <Table.Body>
                    {documentos.map((documento) => <Table.Row key={documento._id}>
                      <Table.Cell>{!paid ? <Button size="xs" colorPalette="red" variant="subtle" disabled={removeMutation.isPending} onClick={() => { if (window.confirm("Retirar este documento do pagamento? O valor da conta será recalculado.")) removeMutation.mutate(documento._id); }}>Excluir do pagamento</Button> : <Text fontSize="10px" color="#98A2B3">Conta paga</Text>}</Table.Cell>
                      <Table.Cell fontWeight="600">{documento.numeroDocumentoFiscal || "—"}</Table.Cell>
                      <Table.Cell>{documento.tipoDocumentoFiscal || "—"}</Table.Cell>
                      <Table.Cell textAlign="right">{money(documento.valorFaturado)}</Table.Cell>
                      <Table.Cell><Status>{documento.statusAprovacao}</Status></Table.Cell>
                      <Table.Cell><Status>{documento.statusIntegracao}</Status></Table.Cell>
                    </Table.Row>)}
                    {!documentos.length ? <Table.Row><Table.Cell colSpan={6}><Text py={8} textAlign="center" color="#98A2B3">Nenhum documento relacionado.</Text></Table.Cell></Table.Row> : null}
                  </Table.Body>
                </Table.Root>
              </Box>
            </Box>
          </>
        ) : null}
      </Stack>
    </Overlay>
  );
}
