import { expect, test, type Page } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

async function makeCard(page: Page, name: string) {
  await page.getByLabel("Name on your code").fill(name);
  await page.getByRole("button", { name: "Create my QR code" }).click();
  await expect(page.locator(".network-qr-exchange")).toBeVisible();
}

test("security audit — a contact code from another room cannot create a request", async ({
  browser,
  baseURL,
}) => {
  const { a, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await makeCard(a, "Alex");
    await a
      .getByLabel("paste payload")
      .fill("https://example.invalid/#r=another-room&p=outside-peer&x=Casey");
    await a.getByRole("button", { name: "use", exact: true }).click();

    await expect(a.locator(".network-exchange-notice")).toContainText(
      "That code belongs to a different room",
    );
    await expect(a.locator(".network-connection-total")).toHaveText("0");
    await expect(a.getByRole("heading", { name: "Waiting on you" })).toBeVisible();
    await expect(a.getByText("No one is waiting for your return scan.")).toBeVisible();
  } finally {
    await cleanup();
  }
});
