import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StationsProvider, useStations } from "./use-stations"

const mockStations = [
  {
    id: "station-1",
    max_power_kw: 22,
    status: "Available",
    last_seen_at: new Date().toISOString(),
    current_power_kw: 0,
    current_meter_wh: 0,
    active_transaction_id: null,
    updated_at: new Date().toISOString(),
  },
]

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    api: {
      getStations: vi.fn().mockResolvedValue([
        {
          id: "station-1",
          max_power_kw: 22,
          status: "Available",
          last_seen_at: new Date().toISOString(),
          current_power_kw: 0,
          current_meter_wh: 0,
          active_transaction_id: null,
          updated_at: new Date().toISOString(),
        },
      ]),
      startCharging: vi.fn().mockResolvedValue({}),
      stopCharging: vi.fn().mockResolvedValue({}),
    },
    subscribeEvents: vi.fn(() => () => {}),
  }
})

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <StationsProvider>{children}</StationsProvider>
    </QueryClientProvider>
  )
}

describe("useStations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads stations on mount", async () => {
    const { result } = renderHook(() => useStations(), { wrapper })

    await waitFor(() => {
      expect(result.current.stations).toHaveLength(1)
    })
  })
})
