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
          permite compor contas a pagar agrupadas e mantém o fluxo sincronizado com o Omie.
        </p>
        <div style={calloutStyle}>
          No processo manual, <Strong>aprovar</Strong> e <Strong>gerar pagamento</Strong> são etapas separadas.
          Assim, o usuário pode revisar os documentos primeiro e somente depois decidir em qual conta a pagar eles serão incluídos.
        </div>
      </header>

      <div style={gridStyle}>
        <SectionCard kicker="Operação" title="Processo manual">
          <p style={bodyStyle}>
            Use este fluxo quando a automação de aprovação estiver desabilitada em
            <Strong> Configurações &gt; Parâmetros da operação</Strong>.
          </p>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 18 }}>1. Aprovar documentos fiscais</h3>
          <Flow
            items={[
              <>
                Em <Strong>Documentos fiscais</Strong>, a Central lista NF-es e CT-es pendentes trazidas do Omie.
                Documentos recusados, cancelados ou com recusa em andamento deixam de aparecer na lista operacional.
              </>,
              <>
                Clique em <Strong>Aprovar</Strong> para aprovar o documento. A aprovação, sozinha,
                <Strong> não cria nem altera uma conta a pagar</Strong>.
              </>,
              <>
                É possível selecionar vários documentos e usar <Strong>Aprovar selecionados</Strong> para fazer a aprovação em lote.
              </>,
              <>
                Clique em <Strong>Recusar</Strong> para solicitar a exclusão do recebimento fiscal no Omie.
                Após a confirmação, o documento fica como recusado/cancelado e concluído na Central.
              </>,
            ]}
          />

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>2. Gerar contas a pagar</h3>
          <Flow
            items={[
              <>
                Somente documentos <Strong>aprovados</Strong> e ainda sem pagamento podem ser usados na ação
                <Strong> Gerar pagamento</Strong>. Também é possível selecionar vários documentos compatíveis e gerar em lote.
              </>,
              <>
                Na confirmação, revise os documentos e informe <Strong>categoria</Strong>, <Strong>conta corrente</Strong>
                e <Strong>data de vencimento</Strong>. Os três parâmetros podem ser alterados antes da geração.
              </>,
              <>
                Se já houver contas em aberto compatíveis para o fornecedor e tipo fiscal, a Central mostra a lista.
                Selecione uma delas para adicionar os documentos ou escolha <Strong>Criar um novo contas a pagar</Strong>.
              </>,
              <>
                Ao confirmar, a Central vincula os documentos, recalcula quantidade e valor total e segue a configuração
                de sincronização automática ou manual com o Omie.
              </>,
            ]}
          />

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>3. Revisar a composição do pagamento</h3>
          <Flow
            items={[
              <>
                Em <Strong>Contas a pagar agrupadas</Strong>, abra <Strong>Detalhes</Strong> para visualizar todos os documentos relacionados.
              </>,
              <>
                Enquanto a conta não estiver paga, use <Strong>Excluir do pagamento</Strong> para retirar um documento.
                O documento permanece aprovado e volta a ficar disponível para uma nova geração de pagamento.
              </>,
              <>
                A conta é recalculada automaticamente. Se era o último documento, a conta local é removida ou a exclusão é enviada ao Omie,
                conforme o estágio da sincronização.
              </>,
            ]}
          />
        </SectionCard>

        <SectionCard kicker="Critérios" title="Regras de Negócio">
          <ul style={listStyle}>
            <li>
              São processados documentos na etapa <Strong>Faturado pelo fornecedor</Strong>, com status pendente,
              dos tipos <Strong>NF-e</Strong> e <Strong>CT-e</Strong>.
            </li>
            <li>
              <Strong>Documento não aprovado não pode gerar pagamento.</Strong> Aprovação e geração são ações independentes no fluxo manual.
            </li>
            <li>
              Um mesmo contas a pagar só pode receber documentos da mesma <Strong>instância Omie + fornecedor + tipo de documento fiscal</Strong>.
            </li>
            <li>
              No fluxo manual, o usuário pode adicionar documentos a uma conta aberta compatível ou criar uma nova conta para o mesmo fornecedor.
              No fluxo automático, a Central continua consolidando conforme a chave de agrupamento.
            </li>
            <li>
              O valor da conta é sempre a soma dos documentos aprovados atualmente vinculados ao agrupamento.
            </li>
            <li>
              A sugestão inicial de vencimento segue a <Strong>próxima quarta-feira</Strong>. Se o documento entrar numa quarta-feira,
              a sugestão vai para a quarta-feira da semana seguinte. No formulário de geração, o usuário pode alterar a data.
            </li>
            <li>
              A data confirmada passa a ser o vencimento da conta e dos documentos relacionados àquele pagamento.
            </li>
            <li>
              A geração exige <Strong>categoria financeira</Strong> e <Strong>conta corrente</Strong> válidas.
              A Central sugere os padrões configurados ou os valores da conta selecionada, permitindo edição antes da confirmação.
            </li>
            <li>
              Um título já existente no Omie é atualizado; uma nova conta ainda não criada no Omie gera um novo título.
            </li>
            <li>
              Uma conta paga não permite retirada de documentos nem exclusão pela ação normal da Central.
            </li>
          </ul>
        </SectionCard>

        <SectionCard kicker="Exceções" title="Fluxos de Reversão">
          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 16 }}>Documento removido do pagamento</h3>
          <ul style={listStyle}>
            <li>
              O vínculo com a conta a pagar é removido e o documento permanece <Strong>Aprovado</Strong>, novamente disponível para geração.
            </li>
            <li>
              A quantidade e o valor total da conta são recalculados. Quando a sincronização automática está habilitada,
              a alteração é enviada ao Omie; caso contrário, a conta volta a disponibilizar a ação manual de envio.
            </li>
            <li>
              Se era o último documento, a Central não mantém uma conta ativa com valor zero.
            </li>
          </ul>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>Documento fiscal cancelado</h3>
          <ul style={listStyle}>
            <li>
              Se o documento for cancelado, devolvido ou denegado <Strong>antes do pagamento</Strong>, ele é concluído e removido do agrupamento.
              A conta remanescente é recalculada e atualizada no Omie.
            </li>
            <li>
              Se era o último documento válido da conta, a Central solicita a exclusão da conta a pagar no Omie.
            </li>
            <li>
              Se o cancelamento ocorrer <Strong>depois do pagamento</Strong>, a Central registra que o documento foi cancelado após o pagamento
              e preserva a conta já paga.
            </li>
          </ul>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>Pagamento cancelado</h3>
          <p style={bodyStyle}>
            Ao identificar que o pagamento foi cancelado no Omie, a conta passa para
            <Strong> Pagamento cancelado</Strong> e os documentos vinculados voltam para
            <Strong> Faturado pelo fornecedor</Strong>, ficando novamente pendentes de conclusão no Omie.
          </p>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>Exclusão integral da conta a pagar</h3>
          <Flow
            items={[
              <>
                A ação <Strong>Excluir conta</Strong> solicita a exclusão no Omie quando a conta já foi sincronizada.
              </>,
              <>
                No fluxo de exclusão integral, a conta anterior é marcada como excluída e os documentos elegíveis são restaurados para o fluxo operacional.
              </>,
              <>
                A Central reprocessa os documentos conforme as automações vigentes e mantém a rastreabilidade da reversão.
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
            Quando habilitada, a Central aprova automaticamente os documentos elegíveis e cria/atualiza a conta agrupada conforme a regra automática.
            As ações manuais de aprovação e recusa ficam indisponíveis na listagem.
          </p>
          <p style={bodyStyle}>
            Quando desabilitada, cada documento permanece aguardando decisão do usuário. A aprovação passa a ser independente da geração do pagamento,
            permitindo revisão individual ou em lote antes da composição financeira.
          </p>

          <h3 style={{ ...titleStyle, fontSize: 17, marginTop: 22 }}>
            Sincronizar automático o Contas a Pagar com o Omie
          </h3>
          <p style={bodyStyle}>
            Quando habilitada, a conta gerada, alterada ou recalculada é enviada automaticamente para o Omie.
            As ações manuais <Strong>Enviar para Omie</Strong> e <Strong>Verificar pagamento</Strong> ficam ocultas.
          </p>
          <p style={bodyStyle}>
            Quando desabilitada, a conta fica em <Strong>Pendente envio</Strong> até o usuário executar o envio;
            depois disso, a situação do pagamento pode ser consultada manualmente.
          </p>

          <div style={calloutStyle}>
            Em uma base nova, as duas automações nascem habilitadas por padrão. Elas podem ser ligadas ou desligadas separadamente conforme o estágio de homologação da operação.
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
