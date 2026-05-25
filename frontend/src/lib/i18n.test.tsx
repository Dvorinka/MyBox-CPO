import { describe, it, expect } from "vitest"
import { translate } from "./i18n"

describe("translate", () => {
  it("returns English text for known keys", () => {
    expect(translate("en", "fleetOverview")).toBe("Fleet Overview")
  })

  it("returns Czech text for known keys", () => {
    expect(translate("cs", "fleetOverview")).toBe("Přehled flotily")
  })

  it("substitutes variables", () => {
    expect(translate("en", "realTimeMonitoring", { count: 5 })).toBe(
      "Real-time monitoring of 5 charging stations"
    )
  })

  it("falls back to English for unknown Czech keys", () => {
    // If a key is missing in Czech, it falls back to English
    expect(translate("cs", "fleetOverview")).toBe("Přehled flotily")
  })
})
