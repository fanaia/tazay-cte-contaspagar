import { startCentralFromManifest } from "@oondemand/oon-core-front";
import app from "../../central.app.json";
import ui from "../central.ui.json";
import { DashboardPage } from "./DashboardPage";
import { HelpPage } from "./HelpPage";
import { ContasPagarPage, DocumentosFiscaisPage } from "./OperationalPages";

const documentosFiscaisManifest = ui.collections.find((collection) => collection.model === "Compra");
const contasPagarManifest = ui.collections.find((collection) => collection.model === "ContaPagarAgrupada");

if (!documentosFiscaisManifest || !contasPagarManifest) {
  throw new Error("As coleções Compra e ContaPagarAgrupada devem estar declaradas no central.ui.json.");
}

const uiManifest = {
  ...ui,
  collections: ui.collections.filter((collection) => !["Compra", "ContaPagarAgrupada"].includes(collection.model)),
  pages: [
    {
      id: "dashboard",
      path: "/",
      label: "Dashboard",
      title: "Dashboard",
      section: "Operação",
      component: "DashboardPage",
      order: 0,
    },
    ...(ui.pages ?? []),
    {
      id: "documentos-fiscais",
      path: documentosFiscaisManifest.path ?? "/compras",
      label: documentosFiscaisManifest.label ?? "Documentos fiscais",
      title: documentosFiscaisManifest.label ?? "Documentos fiscais",
      section: documentosFiscaisManifest.section ?? "Operação",
      component: "DocumentosFiscaisPage",
      order: 10,
    },
    {
      id: "contas-pagar-agrupadas",
      path: contasPagarManifest.path ?? "/contas-pagar-agrupadas",
      label: contasPagarManifest.label ?? "Contas a pagar agrupadas",
      title: contasPagarManifest.label ?? "Contas a pagar agrupadas",
      section: contasPagarManifest.section ?? "Financeiro",
      component: "ContasPagarPage",
      order: 20,
    },
    {
      id: "ajuda",
      path: "/ajuda",
      label: "Ajuda",
      title: "Ajuda",
      section: "Sistema",
      icon: "?",
      component: "HelpPage",
      order: 950,
    },
  ],
};

type CentralUi = Parameters<typeof startCentralFromManifest>[0]["ui"];

startCentralFromManifest({ app, ui: uiManifest as CentralUi }, {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  meusAppsUrl: import.meta.env.VITE_MEUS_APPS_URL,
  devToken: import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? "dev-local") : undefined,
  customComponents: { DashboardPage, DocumentosFiscaisPage, ContasPagarPage, HelpPage },
});
