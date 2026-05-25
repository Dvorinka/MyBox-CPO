import { createContext, useContext, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { Station } from "@/types"
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
      }
    })
    return unsubscribe
  }, [queryClient])

  const startCharging = useCallback(async (id: string) => {
    await api.startCharging(id)
  }, [])

  const stopCharging = useCallback(async (id: string) => {
    await api.stopCharging(id)
  }, [])

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
