import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import type { ChargingSession, Station } from "@/types"
import { useI18n } from "@/lib/i18n"
import { useChartTheme } from "@/hooks/use-chart-theme"
import { TrendingUp, Users, Clock, Zap } from "lucide-react"

interface RevenueDetailProps {
  sessions: ChargingSession[]
  stations: Station[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function RevenueDetail({ sessions, stations, open, onOpenChange }: RevenueDetailProps) {
  const { t } = useI18n()
  const { isDark, gridStroke, tickFill, tooltipStyle, primary, accent, destructive } = useChartTheme()

  const stats = useMemo(() => {
    const stationStats = new Map<string, { peakRev: number; offPeakRev: number; sessions: number; energy: number }>()
    const overall = { peakRev: 0, offPeakRev: 0, totalSessions: 0, totalEnergy: 0, acRev: 0, dcRev: 0 }

    stations.forEach((s) => stationStats.set(s.id, { peakRev: 0, offPeakRev: 0, sessions: 0, energy: 0 }))

    sessions.forEach((s) => {
      if (typeof s.total_cost !== "number" || !s.end_time) return
      const st = stationStats.get(s.station_id)
      if (!st) return

      const tariff = s.pricing_tariff ?? ""
      if (tariff.includes("peak")) {
        st.peakRev += s.total_cost
        overall.peakRev += s.total_cost
      } else {
        st.offPeakRev += s.total_cost
        overall.offPeakRev += s.total_cost
      }

      st.sessions += 1
      overall.totalSessions += 1

      if (typeof s.total_kwh === "number") {
        st.energy += s.total_kwh
        overall.totalEnergy += s.total_kwh
      }

      const powerClass = s.station_power_class ?? ""
      if (powerClass === "dc") overall.dcRev += s.total_cost
      else overall.acRev += s.total_cost
    })

    const barData = Array.from(stationStats.entries()).map(([id, vals]) => ({
      id,
      peak: Number(vals.peakRev.toFixed(2)),
      offPeak: Number(vals.offPeakRev.toFixed(2)),
      sessions: vals.sessions,
      avgValue: vals.sessions > 0 ? Number((vals.peakRev + vals.offPeakRev / vals.sessions).toFixed(2)) : 0,
    }))

    const pieData = [
      { name: "AC", value: Number(overall.acRev.toFixed(2)), fill: accent },
      { name: "DC", value: Number(overall.dcRev.toFixed(2)), fill: primary },
      { name: t("peakRevenue"), value: Number(overall.peakRev.toFixed(2)), fill: destructive },
      { name: t("offPeakRevenue"), value: Number(overall.offPeakRev.toFixed(2)), fill: "#38bdf8" },
    ].filter((d) => d.value > 0)

    return {
      barData,
      pieData,
      totalRevenue: overall.peakRev + overall.offPeakRev,
      totalSessions: overall.totalSessions,
      avgSessionValue: overall.totalSessions > 0 ? (overall.peakRev + overall.offPeakRev) / overall.totalSessions : 0,
      totalEnergy: overall.totalEnergy,
    }
  }, [sessions, stations, isDark, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-tight">{t("revenueDetail")}</DialogTitle>
          <DialogDescription>{t("revenueByStation")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard icon={<TrendingUp className="h-4 w-4 text-accent" />} label={t("totalRevenue")} value={`${stats.totalRevenue.toFixed(2)} Kč`} />
            <SummaryCard icon={<Users className="h-4 w-4 text-accent" />} label={t("customers")} value={String(stats.totalSessions)} />
            <SummaryCard icon={<Clock className="h-4 w-4 text-accent" />} label={t("avgSessionValue")} value={`${stats.avgSessionValue.toFixed(2)} Kč`} />
            <SummaryCard icon={<Zap className="h-4 w-4 text-accent" />} label={t("totalEnergy")} value={`${stats.totalEnergy.toFixed(2)} kWh`} />
          </div>

          {/* Stacked bar chart by station */}
          <div>
            <h4 className="mb-3 text-sm font-medium text-muted-foreground">{t("revenueByStation")}</h4>
            {stats.barData.length === 0 || stats.totalRevenue === 0 ? (
              <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                {t("noChargingDataYet")}
              </div>
            ) : (
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.barData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="id" tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} unit=" Kč" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => {
                      const label = name === "peak" ? t("peakRevenue") : t("offPeakRevenue")
                      const num = typeof value === "number" ? value : 0
                      return [`${num.toFixed(2)} Kč`, label]
                    }} />
                    <Bar dataKey="peak" stackId="a" fill={destructive} radius={[0, 0, 4, 4]} />
                    <Bar dataKey="offPeak" stackId="a" fill={primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Session count per station */}
          <div>
            <h4 className="mb-3 text-sm font-medium text-muted-foreground">{t("customers")}</h4>
            {stats.barData.length === 0 ? (
              <div className="flex h-[160px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                {t("noChargingDataYet")}
              </div>
            ) : (
              <div className="h-[160px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.barData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="id" tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="sessions" fill={accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Revenue breakdown table */}
          <div className="rounded-lg border">
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="border-b">
                  <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">{t("stations")}</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">{t("peakRevenue")}</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">{t("offPeakRevenue")}</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">{t("customers")}</th>
                  <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">{t("avgSessionValue")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.barData.map((row) => (
                  <tr key={row.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="p-4 align-middle text-xs font-medium">{row.id}</td>
                    <td className="p-4 align-middle text-right text-xs">{row.peak.toFixed(2)} Kč</td>
                    <td className="p-4 align-middle text-right text-xs">{row.offPeak.toFixed(2)} Kč</td>
                    <td className="p-4 align-middle text-right text-xs">{row.sessions}</td>
                    <td className="p-4 align-middle text-right text-xs font-medium">
                      {row.sessions > 0 ? `${((row.peak + row.offPeak) / row.sessions).toFixed(2)} Kč` : "—"}
                    </td>
                  </tr>
                ))}
                {stats.barData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                      {t("noChargingDataYet")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="border-none shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-2 text-lg font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}
