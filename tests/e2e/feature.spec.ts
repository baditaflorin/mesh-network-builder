import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("mutual = both must scan; one-way shows as 'received'", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");

    await a.locator(".mesh-qrx-payload summary").click();
    const aPayload = (await a.locator(".mesh-qrx-payload code").textContent()) ?? "";
    await b.getByPlaceholder("or paste a mesh:// payload").fill(aPayload);
    await b.getByRole("button", { name: "use", exact: true }).click();

    await expect(a.locator("section").nth(1)).toContainText("bob");

    await b.locator(".mesh-qrx-payload summary").click();
    const bPayload = (await b.locator(".mesh-qrx-payload code").textContent()) ?? "";
    await a.getByPlaceholder("or paste a mesh:// payload").fill(bPayload);
    await a.getByRole("button", { name: "use", exact: true }).click();

    await expect(a.locator(".viral-status")).toContainText("1 mutual");
    await expect(b.locator(".viral-status")).toContainText("1 mutual");
  } finally {
    await cleanup();
  }
});
