import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-network-builder",
  breadcrumbs: false,
  displayName: "Linkfield",
  visualProfile: "field",
  shellLayout: "inset",
  description:
    "Build a consented contact map with two-way QR confirmation and export-ready records.",
  accentHex: "#e6bd52",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
