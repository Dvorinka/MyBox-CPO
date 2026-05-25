import { createContext, useContext, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { MeterValue, Station, StationCommand } from "@/types"
import { api, subscribeEvents } from "@/lib/api"

interface StationsContextType {
  stations: Station[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  startCharging: (id: string) => Promise<void>
  stopCharging: (id: string) => Promise<void>
}

const StationsContext = createContext<StationsContextType | null>(null)

export function StationsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const { data: stations = [], isLoading, error } = useQuery<Station[]>({
    queryKey: ["stations"],
    queryFn: api.getStations,
    staleTime: 5000,
  })

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["stations"] })
  }, [queryClient])

  useEffect(() => {
    const unsubscribe = subscribeEvents((type, data) => {
      if ((type === "station_update" || type === "heartbeat") && data && typeof data === "object") {
        const station = data as Station
        // SSE station events keep fleet and any open detail dialog in sync.
        queryClient.setQueryData<Station[]>(["stations"], (prev) => {
          if (!prev) return [station]
          const idx = prev.findIndex((s) => s.id === station.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = station
            return next
          }
          return [...prev, station]
        })
        if (["Available", "Faulted", "Offline"].includes(station.status)) {
          void queryClient.invalidateQueries({ queryKey: ["sessions", station.id] })
          void queryClient.invalidateQueries({ queryKey: ["all-sessions"] })
        }
      }

      if (type === "meter_value" && data && typeof data === "object") {
        const meter = data as MeterValue
        queryClient.setQueryData<MeterValue[]>(["meter-values", meter.station_id], (prev) => {
          const next = [...(prev ?? []), meter]
          const deduped = Array.from(
            new Map(next.map((value) => [`${value.measured_at}:${value.transaction_id ?? ""}`, value])).values()
          )
          return deduped
            .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime())
            .slice(-1000)
        })
      }

      if (type === "command_update" && data && typeof data === "object") {
        const command = data as StationCommand
        void queryClient.invalidateQueries({ queryKey: ["sessions", command.station_id] })
        void queryClient.invalidateQueries({ queryKey: ["all-sessions"] })
      }
    })
    return unsubscribe
  }, [queryClient])

  const startCharging = useCallback(async (id: string) => {
    await api.startCharging(id)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["stations"] }),
      queryClient.invalidateQueries({ queryKey: ["all-sessions"] }),
    ])
  }, [queryClient])

  const stopCharging = useCallback(async (id: string) => {
    await api.stopCharging(id)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["stations"] }),
      queryClient.invalidateQueries({ queryKey: ["sessions", id] }),
      queryClient.invalidateQueries({ queryKey: ["meter-values", id] }),
      queryClient.invalidateQueries({ queryKey: ["all-sessions"] }),
    ])
  }, [queryClient])

  return (
    <StationsContext.Provider
      value={{
        stations,
        isLoading,
        error: error instanceof Error ? error.message : null,
        refresh,
        startCharging,
        stopCharging,
      }}
    >
      {children}
    </StationsContext.Provider>
  )
}

export function useStations() {
  const ctx = useContext(StationsContext)
  if (!ctx) throw new Error("useStations must be used within StationsProvider")
  return ctx
}
