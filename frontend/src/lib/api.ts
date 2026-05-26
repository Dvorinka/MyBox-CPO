import type { Station, ChargingSession, MeterValue, StartResponse, StopResponse } from "@/types"

const API_BASE = "/api"

export interface PricingSettings {
  peak_price_per_kwh: number
  offpeak_price_per_kwh: number
  peak_start_hour: number
  peak_end_hour: number
  dc_multiplier: number
  updated_at: string
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/refresh`, { method: "POST", credentials: "include" })
    return res.ok
  } catch {
    return false
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      const refreshed = await refreshToken()
      if (!refreshed) {
        window.dispatchEvent(new Event("mybox:auth:expired"))
      }
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data as T
}

export const api = {
  login: async (username: string, password: string): Promise<{ type: string }> => {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    })
    return handleResponse<{ type: string }>(res)
  },

  logout: async () => {
    await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "include" }).catch(() => {})
  },

  isAuthenticated: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/me`, { credentials: "include" })
      return res.ok
    } catch {
      return false
    }
  },

  getStations: (): Promise<Station[]> =>
    fetch(`${API_BASE}/stations`, { credentials: "include" }).then((r) => handleResponse<Station[]>(r)),

  getStation: (id: string): Promise<Station> =>
    fetch(`${API_BASE}/stations/${id}`, { credentials: "include" }).then((r) => handleResponse<Station>(r)),

  getSessions: (id: string, limit = 100): Promise<ChargingSession[]> =>
    fetch(`${API_BASE}/stations/${id}/sessions?limit=${limit}`, { credentials: "include" }).then((r) =>
      handleResponse<ChargingSession[]>(r)
    ),

  getMeterValues: (id: string, minutes = 30, limit = 1000): Promise<MeterValue[]> =>
    fetch(`${API_BASE}/stations/${id}/meter-values?minutes=${minutes}&limit=${limit}`, { credentials: "include" }).then(
      (r) => handleResponse<MeterValue[]>(r)
    ),

  startCharging: (id: string): Promise<StartResponse> =>
    fetch(`${API_BASE}/stations/${id}/start`, { method: "POST", credentials: "include" }).then((r) =>
      handleResponse<StartResponse>(r)
    ),

  stopCharging: (id: string): Promise<StopResponse> =>
    fetch(`${API_BASE}/stations/${id}/stop`, { method: "POST", credentials: "include" }).then((r) =>
      handleResponse<StopResponse>(r)
    ),

  getPricing: (): Promise<PricingSettings> =>
    fetch(`${API_BASE}/pricing`, { credentials: "include" }).then((r) => handleResponse<PricingSettings>(r)),

  setPricing: (settings: Omit<PricingSettings, "updated_at">): Promise<{ status: string }> =>
    fetch(`${API_BASE}/pricing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(settings),
    }).then((r) => handleResponse<{ status: string }>(r)),
}

export function subscribeEvents(onEvent: (type: string, data: unknown) => void) {
  const source = new EventSource(`${API_BASE}/events`)

  source.addEventListener("station_update", (e) => {
    try {
      const parsed = JSON.parse((e as MessageEvent).data)
      onEvent("station_update", parsed)
    } catch {
      // ignore
    }
  })

  source.addEventListener("meter_value", (e) => {
    try {
      const parsed = JSON.parse((e as MessageEvent).data)
      onEvent("meter_value", parsed)
    } catch {
      // ignore
    }
  })

  source.addEventListener("command_update", (e) => {
    try {
      const parsed = JSON.parse((e as MessageEvent).data)
      onEvent("command_update", parsed)
    } catch {
      // ignore
    }
  })

  source.addEventListener("heartbeat", (e) => {
    try {
      const parsed = JSON.parse((e as MessageEvent).data)
      onEvent("heartbeat", parsed)
    } catch {
      // ignore
    }
  })

  return () => {
    source.close()
  }
}
