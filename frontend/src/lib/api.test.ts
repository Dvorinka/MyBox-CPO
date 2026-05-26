import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { api } from "./api"

describe("api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("calls login with credentials", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: "Bearer" }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await api.login("admin", "admin")
    expect(result.type).toBe("Bearer")
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    )
  })

  it("calls logout with credentials", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", mockFetch)

    await api.logout()
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/logout",
      expect.objectContaining({ credentials: "include" })
    )
  })

  it("isAuthenticated returns true when /api/me is ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", mockFetch)

    const result = await api.isAuthenticated()
    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ credentials: "include" })
    )
  })

  it("sends credentials for protected endpoints", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "station-1" }],
    })
    vi.stubGlobal("fetch", mockFetch)

    await api.getStations()
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stations",
      expect.objectContaining({ credentials: "include" })
    )
  })

  it("dispatches auth:expired on 401 when refresh fails", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid refresh" }),
      })
    vi.stubGlobal("fetch", mockFetch)

    const eventSpy = vi.fn()
    window.addEventListener("mybox:auth:expired", eventSpy)

    await expect(api.getStations()).rejects.toThrow()
    expect(eventSpy).toHaveBeenCalled()

    window.removeEventListener("mybox:auth:expired", eventSpy)
  })
})
