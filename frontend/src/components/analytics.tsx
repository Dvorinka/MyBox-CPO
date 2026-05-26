import { useMemo, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarRadiusAxis,
  Label,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import type { ChargingSession, Station } from "@/types"
import { useI18n } from "@/lib/i18n"
import { useChartTheme } from "@/hooks/use-chart-theme"
import RevenueWidget from "@/components/revenue-widget"
import RevenueDetail from "@/components/revenue-detail"

interface AnalyticsProps {
  sessions: ChargingSession[]
  stations: Station[]
}

export default function Analytics({ sessions, stations }: AnalyticsProps) {
  const { t } = useI18n()
  const { isDark, gridStroke, tickFill, tooltipStyle, primary, accent } = useChartTheme()

  // Top 3 stations by total energy delivered
  const topStations = useMemo(() => {
    const map = new Map<string, number>()
    sessions.forEach((s) => {
      if (typeof s.total_kwh === "number") {
        map.set(s.station_id, (map.get(s.station_id) ?? 0) + s.total_kwh)
      }
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, kwh]) => ({ id, kwh: Number(kwh.toFixed(2)) }))
  }, [sessions])

  // AC vs DC breakdown from station max_power_kw threshold
  const acDcData = useMemo(() => {
    let acEnergy = 0
    let dcEnergy = 0
    sessions.forEach((s) => {
      const station = stations.find((st) => st.id === s.station_id)
      const isDC = (station?.max_power_kw ?? 0) >= 50
      if (typeof s.total_kwh === "number") {
        if (isDC) dcEnergy += s.total_kwh
        else acEnergy += s.total_kwh
      }
    })
    return [
      { name: "AC", value: Number(acEnergy.toFixed(2)), fill: accent },
      { name: "DC", value: Number(dcEnergy.toFixed(2)), fill: primary },
    ]
  }, [sessions, stations, isDark])

  // Daily energy (last 7 days)
  const dailyEnergy = useMemo(() => {
    const map = new Map<string, number>()
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      map.set(d.toISOString().slice(0, 10), 0)
    }
    sessions.forEach((s) => {
      const day = s.start_time.slice(0, 10)
      if (map.has(day) && typeof s.total_kwh === "number") {
        map.set(day, (map.get(day) ?? 0) + s.total_kwh)
      }
    })
    return Array.from(map.entries()).map(([day, kwh]) => ({
      day: day.slice(5),
      kwh: Number(kwh.toFixed(2)),
    }))
  }, [sessions])

  // Uptime per station (based on session count vs fault/offline count)
  const uptimeStats = useMemo(() => {
    return stations.map((st) => {
      const stSessions = sessions.filter((s) => s.station_id === st.id)
      const total = stSessions.length
      const completed = stSessions.filter((s) => s.end_time !== null).length
      const uptime = total > 0 ? Math.round((completed / total) * 100) : 100
      return { id: st.id, uptime }
    })
  }, [stations, sessions])

  // Session duration histogram (completed sessions only)
  const durationHistogram = useMemo(() => {
    const buckets = [
      { label: "0–5 min", min: 0, max: 5 * 60 },
      { label: "5–15 min", min: 5 * 60, max: 15 * 60 },
      { label: "15–30 min", min: 15 * 60, max: 30 * 60 },
      { label: "30–60 min", min: 30 * 60, max: 60 * 60 },
      { label: "60+ min", min: 60 * 60, max: Infinity },
    ]
    const counts = new Array(buckets.length).fill(0)
    sessions.forEach((s) => {
      if (!s.end_time || !s.start_time) return
      const durationSec = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000
      for (let i = 0; i < buckets.length; i++) {
        if (durationSec >= buckets[i].min && durationSec < buckets[i].max) {
          counts[i]++
          break
        }
      }
    })
    return buckets.map((b, i) => ({ label: b.label, count: counts[i] }))
  }, [sessions])

  const [revenueDetailOpen, setRevenueDetailOpen] = useState(false)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Revenue by Station */}
      <RevenueWidget
        sessions={sessions}
        stations={stations}
        onClick={() => setRevenueDetailOpen(true)}
      />

      {/* Daily Energy */}
      <Card className="border">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("energyLast7Days")}
          </h3>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyEnergy} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} unit=" kWh" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="kwh" fill={accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top 3 Stations */}
      <Card className="border">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("topStations")}
          </h3>
          {topStations.length === 0 ? (
            <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              {t("noChargingDataYet")}
            </div>
          ) : (
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topStations} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="id"
                    tick={{ fontSize: 10, fill: tickFill }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} unit=" kWh" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="kwh" fill={primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AC vs DC */}
      <Card className="border">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("acVsDc")}
          </h3>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acDcData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: tickFill }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} unit=" kWh" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {acDcData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Uptime radial pills */}
      <Card className="border">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("uptime")}
          </h3>
          {uptimeStats.length === 0 ? (
            <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              {t("noChargingDataYet")}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {uptimeStats.map((st) => {
                const fillColor = st.uptime >= 90
                  ? accent
                  : st.uptime >= 70
                  ? primary
                  : "#1e40af"
                return (
                  <Card key={st.id} className="flex flex-col items-center border p-3">
                    <span className="mb-1 text-[10px] font-medium text-muted-foreground">{st.id}</span>
                    <div className="h-[80px] w-[80px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          data={[{ name: st.id, uptime: st.uptime, fill: fillColor }]}
                          innerRadius="65%"
                          outerRadius="100%"
                          startAngle={90}
                          endAngle={-270}
                        >
                          <RadialBar
                            background
                            dataKey="uptime"
                            cornerRadius={4}
                            fill={fillColor}
                          />
                          <PolarRadiusAxis tick={false} axisLine={false}>
                            <Label
                              content={({ viewBox }) => {
                                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                  return (
                                    <text
                                      x={viewBox.cx}
                                      y={viewBox.cy}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                    >
                                      <tspan className="fill-foreground text-sm font-bold">
                                        {st.uptime}%
                                      </tspan>
                                    </text>
                                  )
                                }
                                return null
                              }}
                            />
                          </PolarRadiusAxis>
                        </RadialBarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Duration Histogram */}
      <Card className="border">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("sessionDuration")}
          </h3>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={durationHistogram} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <RevenueDetail
        sessions={sessions}
        stations={stations}
        open={revenueDetailOpen}
        onOpenChange={setRevenueDetailOpen}
      />
    </div>
  )
}
