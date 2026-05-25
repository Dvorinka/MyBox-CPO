export interface Station {
  id: string
  max_power_kw: number
  status: "Available" | "Preparing" | "Charging" | "Finishing" | "Faulted" | "Offline"
  last_seen_at: string | null
  current_power_kw: number
  current_meter_wh: number
  active_transaction_id: string | null
  updated_at: string
}

export interface ChargingSession {
  id: string
  transaction_id: string
  station_id: string
  start_time: string
  end_time: string | null
  start_meter_wh: number
  end_meter_wh: number | null
  total_kwh: number | null
  total_cost: number | null
}

export interface MeterValue {
  station_id: string
  transaction_id: string | null
  measured_at: string
  power_kw: number
  meter_wh: number
}

export interface StartResponse {
  station_id: string
  transaction_id: string
}

export interface StopResponse {
  station_id: string
  status: string
}

export interface SSEEvent {
  type: string
  data: unknown
}
