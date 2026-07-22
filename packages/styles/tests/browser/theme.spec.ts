import { expect, test } from "@playwright/test";

const COMPONENTS_URL = "http://localhost:5184/components/?env=vanilla";

test.describe("theme", () => {
  test("exposes foundation tokens", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        containerMax: styles.getPropertyValue("--container-max").trim(),
        controlHeight: styles.getPropertyValue("--control-height").trim(),
        focusRing: styles.getPropertyValue("--focus-ring").trim(),
        motionDurationFast: styles.getPropertyValue("--motion-duration-fast").trim(),
        motionDurationNormal: styles.getPropertyValue("--motion-duration-normal").trim(),
        radiusControl: styles.getPropertyValue("--radius-control").trim(),
        elevationLow: styles.getPropertyValue("--elevation-low").trim(),
        layoutGap: styles.getPropertyValue("--layout-gap").trim(),
      };
    });

    expect(tokenValues.containerMax).not.toBe("");
    expect(tokenValues.controlHeight).not.toBe("");
    expect(tokenValues.focusRing).not.toBe("");
    expect(tokenValues.motionDurationFast).not.toBe("");
    expect(tokenValues.motionDurationNormal).not.toBe("");
    expect(tokenValues.radiusControl).not.toBe("");
    expect(tokenValues.elevationLow).not.toBe("");
    expect(tokenValues.layoutGap).not.toBe("");
  });

  test("exposes semantic hover color tokens", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        destructiveHover: styles.getPropertyValue("--color-destructive-hover").trim(),
        infoHover: styles.getPropertyValue("--color-info-hover").trim(),
        successHover: styles.getPropertyValue("--color-success-hover").trim(),
        warningHover: styles.getPropertyValue("--color-warning-hover").trim(),
      };
    });

    expect(tokenValues.destructiveHover).not.toBe("");
    expect(tokenValues.infoHover).not.toBe("");
    expect(tokenValues.successHover).not.toBe("");
    expect(tokenValues.warningHover).not.toBe("");
  });

  test("does not expose legacy root tokens", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        motionDuration: styles.getPropertyValue("--motion-duration").trim(),
        layoutClusterGap: styles.getPropertyValue("--layout-cluster-gap").trim(),
        layoutStackGap: styles.getPropertyValue("--layout-stack-gap").trim(),
        shadowOverlay: styles.getPropertyValue("--shadow-overlay").trim(),
        shadowSurface: styles.getPropertyValue("--shadow-surface").trim(),
      };
    });

    expect(tokenValues.motionDuration).toBe("");
    expect(tokenValues.layoutClusterGap).toBe("");
    expect(tokenValues.layoutStackGap).toBe("");
    expect(tokenValues.shadowOverlay).toBe("");
    expect(tokenValues.shadowSurface).toBe("");
  });
});
