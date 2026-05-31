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
    await b.getByPlaceholder("or paste a payload (URL or mesh://)").fill(aPayload);
    await b.getByRole("button", { name: "use", exact: true }).click();

    await expect(a.locator("section").nth(1)).toContainText("bob");

    await b.locator(".mesh-qrx-payload summary").click();
    const bPayload = (await b.locator(".mesh-qrx-payload code").textContent()) ?? "";
    await a.getByPlaceholder("or paste a payload (URL or mesh://)").fill(bPayload);
    await a.getByRole("button", { name: "use", exact: true }).click();

    await expect(a.locator(".viral-status")).toContainText("1 mutual");
    await expect(b.locator(".viral-status")).toContainText("1 mutual");
  } finally {
    await cleanup();
  }
});

// Load-bearing cross-peer assertion: the advertised core action is
// "two-way QR scan confirmation" + "export GraphML". This test proves that
//   1. a ONE-SIDED scan does NOT create a confirmed (mutual) edge, and
//   2. after BOTH peers scan, a mutual edge A<->B exists on BOTH screens, and
//   3. the GraphML export on BOTH peers actually contains both nodes AND
//      the directed edges between them.
// On the pre-fix code there was no observable GraphML text to assert against,
// so this test could not pass; the export only triggered a blob download.
test("two-way confirm creates a mutual edge that the GraphML export carries on both peers", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");

    // Discover each peer's id from its own QR payload (#…&p=<peerId>&…).
    await a.locator(".mesh-qrx-payload summary").click();
    await b.locator(".mesh-qrx-payload summary").click();
    const aPayload = (await a.locator(".mesh-qrx-payload code").textContent()) ?? "";
    const bPayload = (await b.locator(".mesh-qrx-payload code").textContent()) ?? "";
    const peerIdOf = (payload: string): string => {
      const m = payload.match(/[#&]p=([^&]+)/);
      if (!m) throw new Error(`no peer id in payload: ${payload}`);
      return decodeURIComponent(m[1]!);
    };
    const aId = peerIdOf(aPayload);
    const bId = peerIdOf(bPayload);
    expect(aId).not.toEqual(bId);

    // Read the rendered GraphML text. `.textContent()` works even while the
    // <details> wrapper is collapsed (the node is in the DOM, just hidden).
    const graphml = async (page: typeof a) =>
      (await page.locator(".nb-graphml-text").textContent()) ?? "";

    // --- Step 1: ONE-SIDED scan (B scans A only). NOT a confirmed edge. ---
    await b.getByPlaceholder("or paste a payload (URL or mesh://)").fill(aPayload);
    await b.getByRole("button", { name: "use", exact: true }).click();

    await expect(a.locator(".viral-status")).toContainText("0 mutual");
    await expect(b.locator(".viral-status")).toContainText("0 mutual");

    // The single directed edge is B->A. There must be NO A->B edge yet, so the
    // pair is not mutual. Assert the export reflects exactly one directed edge.
    const xmlBeforeA = await graphml(a);
    expect(xmlBeforeA).toContain(`<edge source="${bId}" target="${aId}"/>`);
    expect(xmlBeforeA).not.toContain(`<edge source="${aId}" target="${bId}"/>`);

    // --- Step 2: A scans B back. Now it is mutual. ---
    await a.getByPlaceholder("or paste a payload (URL or mesh://)").fill(bPayload);
    await a.getByRole("button", { name: "use", exact: true }).click();

    await expect(a.locator(".viral-status")).toContainText("1 mutual");
    await expect(b.locator(".viral-status")).toContainText("1 mutual");

    // --- Step 3: the GraphML export carries the nodes + BOTH directed edges
    //             on BOTH peers (sync crossed the mesh in both directions). ---
    for (const page of [a, b]) {
      const xml = await graphml(page);
      expect(xml).toContain(`<node id="${aId}"><data key="name">alice</data></node>`);
      expect(xml).toContain(`<node id="${bId}"><data key="name">bob</data></node>`);
      expect(xml).toContain(`<edge source="${aId}" target="${bId}"/>`);
      expect(xml).toContain(`<edge source="${bId}" target="${aId}"/>`);
    }
  } finally {
    await cleanup();
  }
});
