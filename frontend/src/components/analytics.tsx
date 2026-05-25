import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import type { ChargingSession, Station } from "@/types"
import { useI18n } from "@/lib/i18n"

interface AnalyticsProps {
  sessions: ChargingSession[]
  stations: Station[]
}

export default function Analytics({ sessions, stations }: AnalyticsProps) {
  const { t } = useI18n()

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
      { name: "AC", value: Number(acEnergy.toFixed(2)), fill: "#2596be" },
      { name: "DC", value: Number(dcEnergy.toFixed(2)), fill: "#102472" },
    ]
  }, [sessions, stations])

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

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Daily Energy */}
      <Card className="border-none shadow-none">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("energyLast7Days")}
          </h3>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyEnergy} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} unit=" kWh" />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "none" }}
                />
                <Bar dataKey="kwh" fill="#2596be" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top 3 Stations */}
      <Card className="border-none shadow-none">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("topStations")}
          </h3>
          {topStations.length === 0 ? (
            <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              {t("noChargingDataYet")}
            </div>
          ) : (
            <div className="space-y-3">
              {topStations.map((st, i) => (
                <div key={st.id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#102472] text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{st.id}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{st.kwh} kWh</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#2596be]"
                        style={{ width: `${Math.min(100, (st.kwh / (topStations[0]?.kwh || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AC vs DC */}
      <Card className="border-none shadow-none">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("acVsDc")}
          </h3>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acDcData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} unit=" kWh" />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "none" }}
                />
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

      {/* Uptime */}
      <Card className="border-none shadow-none">
        <CardContent className="p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("uptime")}
          </h3>
          <div className="space-y-3">
            {uptimeStats.map((st) => (
              <div key={st.id} className="flex items-center gap-3">
                <span className="w-20 text-xs font-medium">{st.id}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#2596be]"
                        style={{ width: `${st.uptime}%` }}
                      />
                    </div>
                    <span className="ml-2 w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                      {st.uptime}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
