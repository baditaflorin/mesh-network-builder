import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-network-builder",
  description: "Mutual-friend networking with two-way QR scan confirmation, export GraphML",
  accentHex: "#f59e0b",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
