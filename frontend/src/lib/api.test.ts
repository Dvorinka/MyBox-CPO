import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { api } from "./api"

describe("api", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("stores token on login", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "test-token", type: "Bearer" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await api.login("admin", "admin")
    expect(result.token).toBe("test-token")
    expect(localStorage.getItem("mybox_token")).toBe("test-token")
  })

  it("removes token on logout", () => {
    localStorage.setItem("mybox_token", "test-token")
    api.logout()
    expect(localStorage.getItem("mybox_token")).toBeNull()
  })

  it("isAuthenticated returns true when token exists", () => {
    localStorage.setItem("mybox_token", "test-token")
    expect(api.isAuthenticated()).toBe(true)
  })

  it("sends Authorization header for protected endpoints", async () => {
    localStorage.setItem("mybox_token", "test-token")
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "station-1" }],
    })
    vi.stubGlobal("fetch", mockFetch)

    await api.getStations()
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stations",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    )
  })

  it("clears token and dispatches event on 401", async () => {
    localStorage.setItem("mybox_token", "test-token")
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const eventSpy = vi.fn()
    window.addEventListener("mybox:auth:expired", eventSpy)

    await expect(api.getStations()).rejects.toThrow()
    expect(localStorage.getItem("mybox_token")).toBeNull()
    expect(eventSpy).toHaveBeenCalled()

    window.removeEventListener("mybox:auth:expired", eventSpy)
  })
})
