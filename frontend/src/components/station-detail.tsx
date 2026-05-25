import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { useQuery } from "@tanstack/react-query"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { Station, MeterValue, ChargingSession } from "@/types"
import { api } from "@/lib/api"
import { statusVariant, statusLabel } from "@/lib/status"
import { Power, Battery, CreditCard, Play, Square } from "lucide-react"
import { useStations } from "@/hooks/use-stations"
import { cn } from "@/lib/utils"

interface StationDetailProps {
  station: Station | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function StationDetail({ station, open, onOpenChange }: StationDetailProps) {
  const { startCharging, stopCharging } = useStations()
  const [actionLoading, setActionLoading] = useState<"start" | "stop" | null>(null)
  const [chartReadyFor, setChartReadyFor] = useState<string | null>(null)
  const [chartWidth, setChartWidth] = useState(0)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const stationID = station?.id ?? null

  const { data: meterValues = [], isLoading: loadingChart } = useQuery<MeterValue[]>({
    queryKey: ["meter-values", stationID],
    queryFn: () => api.getMeterValues(stationID!, 30, 1000),
    enabled: open && !!stationID,
    staleTime: 10000,
  })

  const { data: sessions = [], isLoading: loadingSessions } = useQuery<ChargingSession[]>({
    queryKey: ["sessions", stationID],
    queryFn: () => api.getSessions(stationID!, 100),
    enabled: open && !!stationID,
    staleTime: 10000,
  })

  const chartReady = open && chartReadyFor === stationID

  useEffect(() => {
    if (!open || !stationID) return
    // Recharts measures the dialog before Radix finishes layout; delay chart mount one frame.
    const timer = window.setTimeout(() => setChartReadyFor(stationID), 100)
    return () => window.clearTimeout(timer)
  }, [open, stationID])

  useEffect(() => {
    if (!open || !chartReady) return
    const element = chartContainerRef.current
    if (!element) return
    const updateWidth = () => setChartWidth(Math.max(0, Math.floor(element.getBoundingClientRect().width)))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, chartReady])

  const handleStart = async () => {
    if (!station) return
    setActionLoading("start")
    try {
      await startCharging(station.id)
    } finally {
      setActionLoading(null)
    }
  }

  const handleStop = async () => {
    if (!station) return
    setActionLoading("stop")
    try {
      await stopCharging(station.id)
    } finally {
      setActionLoading(null)
    }
  }

  const chartData = meterValues.map((m) => ({
    time: format(new Date(m.measured_at), "HH:mm:ss"),
    power: m.power_kw,
    energy: m.meter_wh / 1000,
  }))

  const canStart = station?.status === "Available"
  const canStop = station?.status === "Charging" || station?.status === "Preparing"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {station && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <DialogTitle className="text-xl tracking-tight">
                  {station.id}
                </DialogTitle>
                <Badge variant={statusVariant(station.status)}>
                  {statusLabel(station.status)}
                </Badge>
              </div>
              <DialogDescription>
                Max power: {station.max_power_kw} kW &middot; Last seen: {" "}
                {station.last_seen_at
                  ? format(new Date(station.last_seen_at), "HH:mm:ss")
                  : "Never"}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="sessions">Sessions</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 pt-4">
                {/* Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <MetricCard
                    icon={<Power className="h-4 w-4 text-[#2596be]" />}
                    label="Current Power"
                    value={`${station.current_power_kw.toFixed(2)} kW`}
                  />
                  <MetricCard
                    icon={<Battery className="h-4 w-4 text-[#2596be]" />}
                    label="Total Energy"
                    value={`${(station.current_meter_wh / 1000).toFixed(2)} kWh`}
                  />
                  <MetricCard
                    icon={<CreditCard className="h-4 w-4 text-[#2596be]" />}
                    label="Active Transaction"
                    value={station.active_transaction_id ?? "None"}
                    small
                  />
                </div>

                {/* Chart */}
                <div>
                  <h4 className="mb-3 text-sm font-medium text-muted-foreground">
                    Power and energy history (last 30 min)
                  </h4>
                  {loadingChart || !chartReady ? (
                    <Skeleton className="h-[240px] w-full rounded-lg" />
                  ) : chartData.length === 0 ? (
                    <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                      No meter data available
                    </div>
                  ) : (
                    <div ref={chartContainerRef} className="h-[240px] w-full">
                      {chartWidth > 0 ? (
                        <AreaChart
                          width={chartWidth}
                          height={240}
                          data={chartData}
                          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                        >
                          <defs>
                            <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2596be" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#2596be" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#102472" stopOpacity={0.14} />
                              <stop offset="95%" stopColor="#102472" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="time"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={{ stroke: "#e2e8f0" }}
                          />
                          <YAxis
                            yAxisId="power"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={false}
                            unit=" kW"
                          />
                          <YAxis
                            yAxisId="energy"
                            orientation="right"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={false}
                            unit=" kWh"
                          />
                          <Tooltip
                            formatter={(value, name) => {
                              const label = name === "power" ? "Power" : "Energy"
                              const unit = name === "power" ? "kW" : "kWh"
                              return [`${Number(value).toFixed(2)} ${unit}`, label]
                            }}
                            contentStyle={{
                              borderRadius: "8px",
                              border: "1px solid #e2e8f0",
                              boxShadow: "none",
                            }}
                          />
                          <Area
                            yAxisId="energy"
                            type="monotone"
                            dataKey="energy"
                            stroke="#102472"
                            strokeWidth={2}
                            fill="url(#energyGradient)"
                            dot={false}
                            isAnimationActive={true}
                            animationDuration={700}
                            animationEasing="ease-out"
                          />
                          <Area
                            yAxisId="power"
                            type="monotone"
                            dataKey="power"
                            stroke="#2596be"
                            strokeWidth={2}
                            fill="url(#powerGradient)"
                            dot={false}
                            isAnimationActive={true}
                            animationDuration={700}
                            animationEasing="ease-out"
                          />
                        </AreaChart>
                      ) : (
                        <Skeleton className="h-[240px] w-full rounded-lg" />
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={handleStart}
                    disabled={!canStart || actionLoading !== null}
                    className="flex-1 bg-[#102472] hover:bg-[#102472]/90"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {actionLoading === "start" ? "Starting..." : "Start Charging"}
                  </Button>
                  <Button
                    onClick={handleStop}
                    disabled={!canStop || actionLoading !== null}
                    variant="outline"
                    className="flex-1"
                  >
                    <Square className="mr-2 h-4 w-4" />
                    {actionLoading === "stop" ? "Stopping..." : "Stop Charging"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="sessions" className="pt-4">
                {loadingSessions ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    No charging sessions recorded
                  </div>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Start Time</TableHead>
                          <TableHead>End Time</TableHead>
                          <TableHead>Energy</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Tariff</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-xs">
                              {format(new Date(s.start_time), "MMM d, HH:mm")}
                            </TableCell>
                            <TableCell className="text-xs">
                              {s.end_time
                                ? format(new Date(s.end_time), "MMM d, HH:mm")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {typeof s.total_kwh === "number" ? `${s.total_kwh.toFixed(2)} kWh` : "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {s.end_time
                                ? formatDuration(
                                    new Date(s.end_time).getTime() - new Date(s.start_time).getTime()
                                  )
                                : "In progress"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {s.pricing_tariff ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium">
                              {typeof s.total_cost === "number" ? `${s.total_cost.toFixed(2)} CZK` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MetricCard({
  icon,
  label,
  value,
  small,
}: {
  icon: React.ReactNode
  label: string
  value: string
  small?: boolean
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn("mt-2 font-semibold text-foreground", small ? "text-xs" : "text-lg")}>
        {value}
      </p>
    </div>
  )
}

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  const remaining = mins % 60
  if (hours > 0) return `${hours}h ${remaining}m`
  return `${remaining}m`
}
