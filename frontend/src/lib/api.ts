import type { Station, ChargingSession, MeterValue, StartResponse, StopResponse } from "@/types"

const API_BASE = "/api"
const TOKEN_KEY = "mybox_token"

export interface PricingSettings {
  peak_price_per_kwh: number
  offpeak_price_per_kwh: number
  peak_start_hour: number
  peak_end_hour: number
  dc_multiplier: number
  updated_at: string
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event("mybox:auth:expired"))
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data as T
}

export const api = {
  login: async (username: string, password: string): Promise<{ token: string; type: string }> => {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    const data = await handleResponse<{ token: string; type: string }>(res)
    localStorage.setItem(TOKEN_KEY, data.token)
    return data
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
  },

  isAuthenticated: () => !!localStorage.getItem(TOKEN_KEY),

  getStations: (): Promise<Station[]> =>
    fetch(`${API_BASE}/stations`, { headers: getAuthHeaders() }).then((r) => handleResponse<Station[]>(r)),

  getStation: (id: string): Promise<Station> =>
    fetch(`${API_BASE}/stations/${id}`, { headers: getAuthHeaders() }).then((r) => handleResponse<Station>(r)),

  getSessions: (id: string, limit = 100): Promise<ChargingSession[]> =>
    fetch(`${API_BASE}/stations/${id}/sessions?limit=${limit}`, { headers: getAuthHeaders() }).then((r) =>
      handleResponse<ChargingSession[]>(r)
    ),

  getMeterValues: (id: string, minutes = 30, limit = 1000): Promise<MeterValue[]> =>
    fetch(`${API_BASE}/stations/${id}/meter-values?minutes=${minutes}&limit=${limit}`, { headers: getAuthHeaders() }).then(
      (r) => handleResponse<MeterValue[]>(r)
    ),

  startCharging: (id: string): Promise<StartResponse> =>
    fetch(`${API_BASE}/stations/${id}/start`, { method: "POST", headers: getAuthHeaders() }).then((r) =>
      handleResponse<StartResponse>(r)
    ),

  stopCharging: (id: string): Promise<StopResponse> =>
    fetch(`${API_BASE}/stations/${id}/stop`, { method: "POST", headers: getAuthHeaders() }).then((r) =>
      handleResponse<StopResponse>(r)
    ),

  getPricing: (): Promise<PricingSettings> =>
    fetch(`${API_BASE}/pricing`, { headers: getAuthHeaders() }).then((r) => handleResponse<PricingSettings>(r)),

  setPricing: (settings: Omit<PricingSettings, "updated_at">): Promise<{ status: string }> =>
    fetch(`${API_BASE}/pricing`, {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
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
