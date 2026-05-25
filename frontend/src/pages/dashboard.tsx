import { useState, useMemo, lazy, Suspense } from "react"
import { format } from "date-fns"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useStations } from "@/hooks/use-stations"
import { useI18n } from "@/lib/i18n"
import type { Station, ChargingSession } from "@/types"
import { api } from "@/lib/api"
import { statusVariant, statusDotColor } from "@/lib/status"
import ChargingHeatmap from "@/components/charging-heatmap"
import Analytics from "@/components/analytics"
import { Map, MapMarker, MarkerContent, MarkerTooltip, MapPopup } from "@/components/ui/map"
import { cn, getStationLocation } from "@/lib/utils"
import {
  Zap,
  Activity,
  BatteryCharging,
  Power,
  ArrowRight,
  RefreshCw,
  Play,
  Square,
  MapPin,
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
  const { t } = useI18n()
  const { stations, isLoading, error, refresh, startCharging, stopCharging } = useStations()
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, "start" | "stop" | null>>({})

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

  const handleStart = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: "start" }))
    try {
      await startCharging(id)
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: null }))
    }
  }

  const handleStop = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: "stop" }))
    try {
      await stopCharging(id)
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: null }))
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#102472]">
            {t("fleetOverview")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("realTimeMonitoring", { count: stats.total })}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          {t("refresh")}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-[#102472]/20 bg-[#102472]/5 px-4 py-3 text-sm text-[#102472]">
          {t("apiConnectionIssue", { error })}
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<Activity className="h-4 w-4 text-[#2596be]" />}
          label={t("chargingNow")}
          value={stats.charging}
          sub={t("ofStations", { count: stats.total })}
        />
        <StatCard
          icon={<Power className="h-4 w-4 text-[#2596be]" />}
          label={t("totalPower")}
          value={`${stats.totalPower.toFixed(1)} kW`}
        />
        <StatCard
          icon={<BatteryCharging className="h-4 w-4 text-[#2596be]" />}
          label={t("totalEnergy")}
          value={`${(stats.totalEnergy / 1000).toFixed(1)} kWh`}
        />
        <StatCard
          icon={<Zap className="h-4 w-4 text-[#2596be]" />}
          label={t("available")}
          value={stats.available}
          sub={stats.faulted > 0 ? `${stats.faulted} ${t("faulted")}` : undefined}
        />
      </div>

      {/* Main content: station cards + heatmap sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Station cards — take up 2/3 on desktop */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("stations")}
          </h2>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[220px] rounded-xl" />
              ))}
            </div>
          ) : stations.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed">
              <p className="text-sm text-muted-foreground">{t("noStationsConnected")}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {stations.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  onClick={() => openDetail(station)}
                  onStart={() => handleStart(station.id)}
                  onStop={() => handleStop(station.id)}
                  actionLoading={actionLoading[station.id] ?? null}
                />
              ))}
            </div>
          )}
        </div>

        {/* Heatmap sidebar — 1/3 on desktop */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("chargingActivity")}
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

      {/* Fleet Map */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {t("fleetMap")}
        </h2>
        <div className="h-[320px] w-full overflow-hidden rounded-xl border">
          <Map center={[14.4378, 50.0755]} zoom={11}>
            {stations.map((station) => {
              const loc = getStationLocation(station.id)
              return (
                <MapMarker
                  key={station.id}
                  longitude={loc.longitude}
                  latitude={loc.latitude}
                >
                  <MarkerContent>
                    <button
                      onClick={() => openDetail(station)}
                      className={cn(
                        "size-5 rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110",
                        station.status === "Faulted"
                          ? "bg-red-500"
                          : station.status === "Charging"
                          ? "bg-[#102472]"
                          : "bg-[#2596be]"
                      )}
                    />
                  </MarkerContent>
                  <MarkerTooltip>{station.id}</MarkerTooltip>
                  <MapPopup
                    longitude={loc.longitude}
                    latitude={loc.latitude}
                  >
                    <div className="space-y-1">
                      <p className="text-foreground font-medium">{station.id}</p>
                      <p className="text-muted-foreground text-xs">
                        {station.status} · {station.current_power_kw.toFixed(1)} kW
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1 w-full text-xs"
                        onClick={() => openDetail(station)}
                      >
                        {t("details")}
                      </Button>
                    </div>
                  </MapPopup>
                </MapMarker>
              )
            })}
          </Map>
        </div>
      </div>

      {/* Analytics widgets */}
      <Analytics sessions={allSessions} stations={stations} />

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
  onStart,
  onStop,
  actionLoading,
}: {
  station: Station
  onClick: () => void
  onStart: () => void
  onStop: () => void
  actionLoading: "start" | "stop" | null
}) {
  const { t } = useI18n()

  const canStart = station.status === "Available"
  const canStop = station.status === "Charging" || station.status === "Preparing"

  // All card icons are blue-only; status color is shown via badge + dot only
  const iconBg =
    station.status === "Charging"
      ? "bg-[#102472]"
      : station.status === "Faulted"
      ? "bg-[#102472]/70"
      : "bg-[#2596be]"

  const borderClass =
    station.status === "Charging"
      ? "border-[#102472] ring-1 ring-[#102472]/20"
      : station.status === "Faulted"
      ? "border-red-400 ring-1 ring-red-400/20"
      : "border"

  return (
    <Card
      className={cn(
        "group cursor-pointer transition-all duration-300 hover:border-[#2596be]/30 hover:bg-slate-50/50",
        borderClass
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{station.id}</h3>
              <p className="text-xs text-muted-foreground">
                {station.max_power_kw} kW {t("max")}
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
              {t(`status${station.status}` as Parameters<typeof t>[0])}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("currentPower")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {station.current_power_kw.toFixed(2)}{" "}
              <span className="text-xs font-normal text-muted-foreground">kW</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("totalEnergy")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {(station.current_meter_wh / 1000).toFixed(2)}{" "}
              <span className="text-xs font-normal text-muted-foreground">kWh</span>
            </p>
          </div>
        </div>

        {/* Start / Stop buttons */}
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            className="h-7 flex-1 bg-[#102472] text-[10px] font-medium hover:bg-[#102472]/90"
            disabled={!canStart || actionLoading !== null}
            onClick={(e) => {
              e.stopPropagation()
              onStart()
            }}
          >
            <Play className="mr-1 h-3 w-3" />
            {actionLoading === "start" ? t("starting") : t("startCharging")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-[10px] font-medium"
            disabled={!canStop || actionLoading !== null}
            onClick={(e) => {
              e.stopPropagation()
              onStop()
            }}
          >
            <Square className="mr-1 h-3 w-3" />
            {actionLoading === "stop" ? t("stopping") : t("stopCharging")}
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <span className="text-[10px] text-muted-foreground">
            {station.last_seen_at
              ? t("updatedAt", { time: format(new Date(station.last_seen_at), "HH:mm:ss") })
              : t("neverSeen")}
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
            {t("details")}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
