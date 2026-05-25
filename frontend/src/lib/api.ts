import type { Station, ChargingSession, MeterValue, StartResponse, StopResponse } from "@/types"

const API_BASE = "/api"

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data as T
}

export const api = {
  getStations: (): Promise<Station[]> =>
    fetch(`${API_BASE}/stations`).then((r) => handleResponse<Station[]>(r)),

  getStation: (id: string): Promise<Station> =>
    fetch(`${API_BASE}/stations/${id}`).then((r) => handleResponse<Station>(r)),

  getSessions: (id: string, limit = 100): Promise<ChargingSession[]> =>
    fetch(`${API_BASE}/stations/${id}/sessions?limit=${limit}`).then((r) => handleResponse<ChargingSession[]>(r)),

  getMeterValues: (id: string, minutes = 30, limit = 1000): Promise<MeterValue[]> =>
    fetch(`${API_BASE}/stations/${id}/meter-values?minutes=${minutes}&limit=${limit}`).then((r) => handleResponse<MeterValue[]>(r)),

  startCharging: (id: string): Promise<StartResponse> =>
    fetch(`${API_BASE}/stations/${id}/start`, { method: "POST" }).then((r) => handleResponse<StartResponse>(r)),

  stopCharging: (id: string): Promise<StopResponse> =>
    fetch(`${API_BASE}/stations/${id}/stop`, { method: "POST" }).then((r) => handleResponse<StopResponse>(r)),
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
