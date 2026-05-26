import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import type { ChargingSession, Station } from "@/types"
import { useI18n } from "@/lib/i18n"
import { useChartTheme } from "@/hooks/use-chart-theme"

interface RevenueWidgetProps {
  sessions: ChargingSession[]
  stations: Station[]
  onClick?: () => void
}

export default function RevenueWidget({ sessions, stations, onClick }: RevenueWidgetProps) {
  const { t } = useI18n()
  const { gridStroke, tickFill, tooltipStyle, primary, destructive } = useChartTheme()

  const data = useMemo(() => {
    const stationMap = new Map<string, { peak: number; offPeak: number }>()
    stations.forEach((s) => stationMap.set(s.id, { peak: 0, offPeak: 0 }))

    sessions.forEach((s) => {
      if (typeof s.total_cost !== "number") return
      const tariff = s.pricing_tariff ?? ""
      const existing = stationMap.get(s.station_id)
      if (!existing) return
      if (tariff.includes("peak")) {
        existing.peak += s.total_cost
      } else {
        existing.offPeak += s.total_cost
      }
    })

    return Array.from(stationMap.entries()).map(([id, vals]) => ({
      id,
      peak: Number(vals.peak.toFixed(2)),
      offPeak: Number(vals.offPeak.toFixed(2)),
      total: Number((vals.peak + vals.offPeak).toFixed(2)),
    }))
  }, [sessions, stations])

  const hasData = data.some((d) => d.total > 0)

  return (
    <Card className="border-none shadow-none cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("revenueByStation")}
        </h3>
        {!hasData ? (
          <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
            {t("noChargingDataYet")}
          </div>
        ) : (
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="id" tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} interval={0} />
                <YAxis tick={{ fontSize: 10, fill: tickFill }} tickLine={false} axisLine={false} unit=" Kč" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => {
                    const label = name === "peak" ? t("peakRevenue") : t("offPeakRevenue")
                    const num = typeof value === "number" ? value : 0
                    return [`${num.toFixed(2)} Kč`, label]
                  }}
                />
                <Bar dataKey="peak" stackId="a" fill={destructive} radius={[0, 0, 4, 4]} />
                <Bar dataKey="offPeak" stackId="a" fill={primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
