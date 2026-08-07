import { Box, Flex, Heading, SimpleGrid, Spinner, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useOonApi } from "@oondemand/oon-core-front";

type DashboardResumo = {
  totalDocumentos: number;
  documentosAprovados: number;
  documentosReprovados: number;
  pagamentosGerados: number;
  pagamentosConcluidos: number;
  totalPago: number;
};

const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function MetricCard({ label, value, monetary = false }: { label: string; value: number; monetary?: boolean }) {
  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="#E5E9ED"
      borderRadius="12px"
      px={{ base: 4, md: 5 }}
      py={{ base: 4, md: 5 }}
      minH="112px"
      boxShadow="0 1px 2px rgba(15, 23, 42, 0.03)"
    >
      <Text fontSize="12px" color="gray.500" fontWeight="600">
        {label}
      </Text>
      <Text mt={3} fontSize={{ base: "26px", md: "30px" }} lineHeight="1" fontWeight="700" color="#24323A">
        {monetary ? dinheiro.format(Number(value || 0)) : Number(value || 0).toLocaleString("pt-BR")}
      </Text>
    </Box>
  );
}

export function DashboardPage() {
  const { http } = useOonApi();
  const resumo = useQuery({
    queryKey: ["tazay", "dashboard", "resumo"],
    queryFn: async () => (await http.get<DashboardResumo>("/api/tazay/contas-pagar/resumo")).data,
  });

  return (
    <Box>
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={4} mb={6} direction={{ base: "column", md: "row" }}>
        <Box>
          <Text fontSize="11px" fontWeight="700" color="brand.500" textTransform="uppercase" letterSpacing="0.08em" mb={1}>
            Visão geral
          </Text>
          <Heading size="lg" color="#24323A" letterSpacing="-0.02em">Dashboard</Heading>
          <Text mt={1} fontSize="13px" color="gray.500">
            Acompanhe o processamento dos documentos fiscais e dos pagamentos da operação.
          </Text>
        </Box>
        {resumo.isFetching && !resumo.isLoading ? <Spinner size="sm" color="gray.400" /> : null}
      </Flex>

      {resumo.isLoading ? (
        <Flex minH="220px" align="center" justify="center">
          <Spinner size="lg" />
        </Flex>
      ) : resumo.isError ? (
        <Box borderWidth="1px" borderColor="red.100" bg="red.50" color="red.700" borderRadius="10px" px={4} py={3} fontSize="13px">
          Não foi possível carregar os indicadores do dashboard.
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} gap={4}>
          <MetricCard label="Total de documentos" value={resumo.data?.totalDocumentos ?? 0} />
          <MetricCard label="Aprovados" value={resumo.data?.documentosAprovados ?? 0} />
          <MetricCard label="Reprovados" value={resumo.data?.documentosReprovados ?? 0} />
          <MetricCard label="Pagamentos gerados" value={resumo.data?.pagamentosGerados ?? 0} />
          <MetricCard label="Pagamentos concluídos" value={resumo.data?.pagamentosConcluidos ?? 0} />
          <MetricCard label="Total pago" value={resumo.data?.totalPago ?? 0} monetary />
        </SimpleGrid>
      )}
    </Box>
  );
}
