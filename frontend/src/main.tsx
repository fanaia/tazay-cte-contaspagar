import type { ComponentProps } from "react";
import { CoreCollection, startCentralFromManifest } from "@oondemand/oon-core-front";
import app from "../../central.app.json";
import ui from "../central.ui.json";
import { HelpPage } from "./HelpPage";

const documentosFiscaisManifest = ui.collections.find((collection) => collection.model === "Compra");

if (!documentosFiscaisManifest) {
  throw new Error("A coleção Compra deve estar declarada no central.ui.json.");
}

const documentosFiscaisProps = documentosFiscaisManifest as unknown as ComponentProps<typeof CoreCollection>;

function DocumentosFiscaisPage() {
  return (
    <CoreCollection
      {...documentosFiscaisProps}
      endpoint="/api/tazay/contas-pagar/documentos-fiscais"
    />
  );
}

const uiManifest = {
  ...ui,
  collections: ui.collections.filter((collection) => collection.model !== "Compra"),
  pages: [
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
  customComponents: { DocumentosFiscaisPage, HelpPage },
});
