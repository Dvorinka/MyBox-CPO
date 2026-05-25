import { useState, useMemo, lazy, Suspense } from "react"
import { format } from "date-fns"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useStations } from "@/hooks/use-stations"
import type { Station, ChargingSession } from "@/types"
import { api } from "@/lib/api"
import { statusVariant, statusLabel, statusDotColor } from "@/lib/status"
import ChargingHeatmap from "@/components/charging-heatmap"
import {
  Zap,
  Activity,
  BatteryCharging,
  Power,
  ArrowRight,
  RefreshCw,
} from "lucide-react"

const StationDetail = lazy(() => import("@/components/station-detail"))

function useAllSessions(stationIds: string[]) {
  return useQuery<ChargingSession[]>({
    queryKey: ["all-sessions", stationIds],
    queryFn: async () => {
      const results = await Promise.all(
        stationIds.map((id) => api.getSessions(id, 200))
      )
      return results.flat()
    },
    enabled: stationIds.length > 0,
    staleTime: 30000,
  })
}

export default function Dashboard() {
  const { stations, isLoading, error, refresh } = useStations()
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const stationIds = useMemo(() => stations.map((s) => s.id), [stations])
  const { data: allSessions = [], isLoading: sessionsLoading } = useAllSessions(stationIds)

  const stats = useMemo(() => {
    const total = stations.length
    const charging = stations.filter((s) => s.status === "Charging").length
    const available = stations.filter((s) => s.status === "Available").length
    const faulted = stations.filter((s) => s.status === "Faulted").length
    const offline = stations.filter((s) => s.status === "Offline").length
    const totalPower = stations.reduce((sum, s) => sum + s.current_power_kw, 0)
    const totalEnergy = stations.reduce((sum, s) => sum + s.current_meter_wh, 0)
    return { total, charging, available, faulted, offline, totalPower, totalEnergy }
  }, [stations])

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) ?? null,
    [selectedStationId, stations]
  )

  const openDetail = (station: Station) => {
    setSelectedStationId(station.id)
    setDetailOpen(true)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#102472]">
            Fleet Overview
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time monitoring of {stats.total} charging stations
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          API connection issue: {error}
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<Activity className="h-4 w-4 text-[#2596be]" />}
          label="Charging Now"
          value={stats.charging}
          sub={`of ${stats.total} stations`}
        />
        <StatCard
          icon={<Power className="h-4 w-4 text-[#2596be]" />}
          label="Total Power"
          value={`${stats.totalPower.toFixed(1)} kW`}
        />
        <StatCard
          icon={<BatteryCharging className="h-4 w-4 text-[#2596be]" />}
          label="Total Energy"
          value={`${(stats.totalEnergy / 1000).toFixed(1)} kWh`}
        />
        <StatCard
          icon={<Zap className="h-4 w-4 text-[#2596be]" />}
          label="Available"
          value={stats.available}
          sub={stats.faulted > 0 ? `${stats.faulted} faulted` : undefined}
        />
      </div>

      {/* Main content: station cards + heatmap sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Station cards — take up 2/3 on desktop */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Stations
          </h2>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[180px] rounded-xl" />
              ))}
            </div>
          ) : stations.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed">
              <p className="text-sm text-muted-foreground">No stations connected</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {stations.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  onClick={() => openDetail(station)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Heatmap sidebar — 1/3 on desktop */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Charging Activity
          </h2>
          {sessionsLoading ? (
            <Skeleton className="h-[180px] w-full rounded-xl" />
          ) : (
            <div className="rounded-xl border p-4">
              <ChargingHeatmap sessions={allSessions} />
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <StationDetail
          station={selectedStation}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      </Suspense>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">{value}</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function StationCard({
  station,
  onClick,
}: {
  station: Station
  onClick: () => void
}) {
  return (
    <Card
      className="group cursor-pointer border transition-all duration-300 hover:border-[#2596be]/30 hover:bg-slate-50/50"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                station.status === "Charging"
                  ? "bg-[#102472]"
                  : station.status === "Available"
                  ? "bg-emerald-500"
                  : station.status === "Faulted"
                  ? "bg-red-500"
                  : "bg-slate-300"
              }`}
            >
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{station.id}</h3>
              <p className="text-xs text-muted-foreground">
                {station.max_power_kw} kW max
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${statusDotColor(station.status)} ${
                station.status === "Charging" ? "animate-pulse" : ""
              }`}
            />
            <Badge variant={statusVariant(station.status)} className="text-[10px]">
              {statusLabel(station.status)}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Current Power
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {station.current_power_kw.toFixed(2)}{" "}
              <span className="text-xs font-normal text-muted-foreground">kW</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Total Energy
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {(station.current_meter_wh / 1000).toFixed(2)}{" "}
              <span className="text-xs font-normal text-muted-foreground">kWh</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <span className="text-[10px] text-muted-foreground">
            {station.last_seen_at
              ? `Updated ${format(new Date(station.last_seen_at), "HH:mm:ss")}`
              : "Never seen"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-[#2596be] hover:text-[#102472]"
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
          >
            Details
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
