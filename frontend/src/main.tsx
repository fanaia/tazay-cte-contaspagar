import { startCentralFromManifest } from "@oondemand/oon-core-front";
import app from "../../central.app.json";
import ui from "../central.ui.json";

const uiManifest = {
  ...ui,
  collections: ui.collections.map((collection) => (
    collection.model === "Compra"
      ? {
        ...collection,
        endpoint: "/api/tazay/contas-pagar/documentos-fiscais",
      }
      : collection
  )),
};

startCentralFromManifest({ app, ui: uiManifest as typeof ui }, {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  meusAppsUrl: import.meta.env.VITE_MEUS_APPS_URL,
  devToken: import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? "dev-local") : undefined,
});
