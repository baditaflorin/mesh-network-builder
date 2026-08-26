import { expect, test } from "@playwright/test";

/**
 * Product-level visual contracts. These protect the deliberate first screen
 * rather than a brittle pixel snapshot: the real action must be usable on a
 * phone and a short desktop window, with its labels available to assistive
 * technology before any QR exchange starts.
 */
test("mobile first screen keeps the contact-card action in view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: /Build a room/i })).toBeVisible();
  await expect(page.getByLabel("Name on your code")).toBeVisible();
  const create = page.getByRole("button", { name: "Create my QR code" });
  await expect(create).toBeVisible();
  await expect(create).toBeDisabled();
  await expect(page.getByText("network builder", { exact: true })).toHaveCount(0);

  const actionBox = await create.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(844);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
});

test("desktop first screen keeps the product promise and action above the fold", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1141, height: 602 });
  await page.goto("./", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("A two-way room contact map", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your room map" })).toBeVisible();
  const create = page.getByRole("button", { name: "Create my QR code" });
  await expect(create).toBeVisible();

  const actionBox = await create.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(602);
});

test("contact-card onboarding is labelled and only opens a QR after intent", async ({ page }) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });

  const main = page.getByRole("main");
  await expect(main).toHaveAttribute("aria-labelledby", "linkfield-title");
  await expect(page.getByRole("heading", { name: "Make a contact code" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your room map" })).toBeVisible();
  await expect(page.locator(".network-qr-exchange")).toHaveCount(0);

  await page.getByLabel("Name on your code").fill("Robin");
  const create = page.getByRole("button", { name: "Create my QR code" });
  await expect(create).toBeEnabled();
  await create.click();

  await expect(page.locator(".network-qr-exchange")).toBeVisible();
  await expect(page.getByRole("button", { name: /Scan their contact code/i })).toBeVisible();
  await expect(page.getByRole("list", { name: "Confirmation path" })).toBeVisible();
});
