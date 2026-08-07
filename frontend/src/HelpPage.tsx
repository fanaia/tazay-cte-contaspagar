import type { CSSProperties, ReactNode } from "react";

const pageStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "8px 4px 40px",
  color: "#14212b",
};

const heroStyle: CSSProperties = {
  border: "1px solid #dce5eb",
  borderRadius: 18,
  padding: "24px 28px",
  background: "linear-gradient(135deg, #f7fbfd 0%, #ffffff 70%)",
  boxShadow: "0 8px 24px rgba(20, 33, 43, 0.05)",
  marginBottom: 20,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 18,
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  border: "1px solid #dce5eb",
  borderRadius: 16,
  padding: 22,
  background: "#ffffff",
  boxShadow: "0 6px 20px rgba(20, 33, 43, 0.04)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.25,
  fontWeight: 700,
  color: "#0d2a36",
};

const kickerStyle: CSSProperties = {
  margin: "0 0 6px",
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#4b7485",
};

const bodyStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 15,
  lineHeight: 1.65,
  color: "#40515c",
};

const listStyle: CSSProperties = {
  margin: "14px 0 0",
  paddingLeft: 22,
  display: "grid",
  gap: 10,
  fontSize: 15,
  lineHeight: 1.6,
  color: "#33454f",
};

const calloutStyle: CSSProperties = {
  marginTop: 16,
  padding: "13px 15px",
  borderRadius: 12,
  border: "1px solid #d9e8ee",
  background: "#f6fafc",
  fontSize: 14,
  lineHeight: 1.55,
  color: "#35515d",
};

const flowStyle: CSSProperties = {
  marginTop: 16,
  display: "grid",
  gap: 10,
};

const flowItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr)",
  gap: 10,
  alignItems: "start",
};

const flowNumberStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "#e9f5f9",
  color: "#1d667f",
  fontSize: 13,
  fontWeight: 700,
};

const flowTextStyle: CSSProperties = {
  margin: 0,
  paddingTop: 3,
  fontSize: 15,
  lineHeight: 1.6,
  color: "#33454f",
};

function Strong({ children }: { children: ReactNode }) {
  return <strong style={{ color: "#183946" }}>{children}</strong>;
}

function SectionCard({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={cardStyle}>
      <p style={kickerStyle}>{kicker}</p>
      <h2 style={titleStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Flow({ items }: { items: ReactNode[] }) {
  return (
    <div style={flowStyle}>
      {items.map((item, index) => (
        <div style={flowItemStyle} key={index}>
          <div style={flowNumberStyle}>{index + 1}</div>
          <p style={flowTextStyle}>{item}</p>
        </div>
      ))}
    </div>
  );
}

export function HelpPage() {
  return (
    <main style={pageStyle}>
      <header style={heroStyle}>
        <p style={kickerStyle}>Central de Contas a Pagar</p>
        <h1 style={{ ...titleStyle, fontSize: 30 }}>Ajuda da operação</h1>
        <p style={{ ...bodyStyle, maxWidth: 860 }}>
          Esta Central acompanha <Strong>NF-es e CT-es</Strong> recebidas no Omie na etapa
          <Strong> Faturado pelo fornecedor</Strong>, organiza a aprovação dos documentos,
          gera contas a pagar agrupadas e mantém o fluxo sincronizado com o Omie.
        </p>
        <div style={calloutStyle}>
          As duas automações são independentes. Quando uma automação está desabilitada,
          a Central libera as ações manuais correspondentes para o usuário.
        </div>
      </header>

      <div style={gridStyle}>
        <SectionCard kicker="Operação" title="Processo manual">
          <p style={bodyStyle}>
            Use este fluxo quando as automações estiverem desabilitadas em
            <Strong> Configurações &gt; Parâmetros da operação</Strong>.
          </p>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 18 }}>1. Documentos fiscais</h3>
          <Flow
            items={[
              <>
                Em <Strong>Documentos fiscais</Strong>, a Central lista NF-es e CT-es pendentes
                trazidas do Omie. Documentos recusados, cancelados ou com recusa em andamento
                deixam de aparecer na lista operacional.
              </>,
              <>
                Clique em <Strong>Aprovar</Strong> para aprovar o documento e criar ou atualizar
                a conta a pagar agrupada correspondente na Central.
              </>,
              <>
                Clique em <Strong>Recusar</Strong> para solicitar a exclusão do recebimento fiscal
                no Omie. Após a confirmação, o documento fica como recusado/cancelado e concluído
                na Central.
              </>,
            ]}
          />

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>2. Contas a pagar agrupadas</h3>
          <Flow
            items={[
              <>
                Em <Strong>Contas a pagar agrupadas</Strong>, confira fornecedor, tipo de documento,
                vencimento, quantidade de documentos e valor total.
              </>,
              <>
                Clique em <Strong>Enviar para Omie</Strong> para criar o título ou atualizar o título
                já existente. Categoria e conta corrente válidas são obrigatórias no momento do envio.
              </>,
              <>
                Depois que a conta estiver enviada, use <Strong>Verificar pagamento</Strong> para fazer
                uma consulta pontual ao Omie e atualizar a situação do título na Central.
              </>,
            ]}
          />
        </SectionCard>

        <SectionCard kicker="Critérios" title="Regras de Negócio">
          <ul style={listStyle}>
            <li>
              São processados documentos na etapa <Strong>Faturado pelo fornecedor</Strong>, com status
              pendente, dos tipos <Strong>NF-e</Strong> e <Strong>CT-e</Strong>.
            </li>
            <li>
              O agrupamento considera <Strong>instância Omie + fornecedor + tipo de documento fiscal</Strong>.
              Assim, NF-e e CT-e do mesmo fornecedor podem ficar em contas agrupadas diferentes.
            </li>
            <li>
              A Central mantém uma conta ativa por chave de agrupamento e consolida duplicidades locais
              ainda não sincronizadas.
            </li>
            <li>
              O valor da conta é a soma dos documentos aprovados e vinculados ao agrupamento.
            </li>
            <li>
              O vencimento de cada documento é a <Strong>próxima quarta-feira</Strong>. Se o documento entrar
              numa quarta-feira, o vencimento vai para a quarta-feira da semana seguinte.
            </li>
            <li>
              Quando vários documentos estão na mesma conta, o vencimento da conta usa o maior vencimento
              entre os documentos relacionados.
            </li>
            <li>
              O envio ao Omie exige <Strong>categoria financeira</Strong> e <Strong>conta corrente</Strong> válidas.
              A Central pode usar os valores do documento/conta ou os padrões definidos nas configurações.
            </li>
            <li>
              Um título já existente no Omie é atualizado; um agrupamento ainda não criado no Omie gera um
              novo título.
            </li>
            <li>
              Uma conta paga não pode ser excluída pela ação normal da Central.
            </li>
          </ul>
        </SectionCard>

        <SectionCard kicker="Exceções" title="Fluxos de Reversão">
          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 16 }}>Documento fiscal cancelado</h3>
          <ul style={listStyle}>
            <li>
              Se o documento for cancelado, devolvido ou denegado <Strong>antes do pagamento</Strong>, ele é
              concluído e removido do agrupamento. A conta remanescente é recalculada e atualizada no Omie.
            </li>
            <li>
              Se era o último documento válido da conta, a Central solicita a exclusão da conta a pagar no Omie.
            </li>
            <li>
              Se o cancelamento ocorrer <Strong>depois do pagamento</Strong>, a Central registra que o documento
              foi cancelado após o pagamento e preserva a conta já paga.
            </li>
          </ul>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>Pagamento cancelado</h3>
          <p style={bodyStyle}>
            Ao identificar que o pagamento foi cancelado no Omie, a conta passa para
            <Strong> Pagamento cancelado</Strong> e os documentos vinculados voltam para
            <Strong> Faturado pelo fornecedor</Strong>, ficando novamente pendentes de conclusão no Omie.
          </p>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>Exclusão da conta a pagar</h3>
          <Flow
            items={[
              <>
                A ação <Strong>Excluir conta</Strong> solicita a exclusão no Omie quando a conta já foi sincronizada.
              </>,
              <>
                Após a exclusão, a conta anterior é marcada como excluída e os documentos elegíveis são restaurados
                para o fluxo operacional.
              </>,
              <>
                A Central reprocessa os documentos, cria a conta substituta, recalcula os valores e enfileira o novo
                envio ao Omie.
              </>,
            ]}
          />

          <div style={calloutStyle}>
            Uma recusa só é concluída depois da exclusão do recebimento fiscal no Omie. Se a integração falhar,
            o documento permanece recuperável para nova tentativa e o erro fica registrado na Central.
          </div>
        </SectionCard>

        <SectionCard kicker="Configuração" title="Automações">
          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 16 }}>
            Aprovar automático documento fiscal e gerar contas a pagar agrupado
          </h3>
          <p style={bodyStyle}>
            Quando habilitada, a Central aprova automaticamente os documentos elegíveis e cria/atualiza a conta
            agrupada. As ações <Strong>Aprovar</Strong> e <Strong>Recusar</Strong> ficam indisponíveis na listagem.
          </p>
          <p style={bodyStyle}>
            Quando desabilitada, cada documento permanece aguardando decisão do usuário e as duas ações manuais
            passam a ser exibidas.
          </p>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>
            Sincronizar automático o Contas a Pagar com o Omie
          </h3>
          <p style={bodyStyle}>
            Quando habilitada, a conta agrupada gerada ou alterada é enviada automaticamente para o Omie.
            As ações manuais <Strong>Enviar para Omie</Strong> e <Strong>Verificar pagamento</Strong> ficam ocultas.
          </p>
          <p style={bodyStyle}>
            Quando desabilitada, a conta fica em <Strong>Pendente envio</Strong> até o usuário executar o envio;
            depois disso, a situação do pagamento pode ser consultada manualmente.
          </p>

          <div style={calloutStyle}>
            Em uma base nova, as duas automações nascem habilitadas por padrão. Elas podem ser ligadas ou desligadas
            separadamente conforme o estágio de homologação da operação.
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
