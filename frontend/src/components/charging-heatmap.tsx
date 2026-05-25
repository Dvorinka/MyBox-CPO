import { useMemo } from "react"
import type { ChargingSession } from "@/types"

interface ChargingHeatmapProps {
  sessions: ChargingSession[]
}

const DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21]

function getDayIndex(date: Date): number {
  const d = date.getDay()
  return d === 0 ? 6 : d - 1
}

function getHourBucket(hour: number): number {
  for (let i = HOURS.length - 1; i >= 0; i--) {
    if (hour >= HOURS[i]) return HOURS[i]
  }
  return 0
}

export default function ChargingHeatmap({ sessions }: ChargingHeatmapProps) {
  const { grid, maxValue } = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 8 }, () => 0)
    )

    sessions.forEach((session) => {
      const start = new Date(session.start_time)
      const dayIdx = getDayIndex(start)
      const hourBucket = getHourBucket(start.getHours())
      const hourIdx = HOURS.indexOf(hourBucket)
      if (dayIdx >= 0 && dayIdx < 7 && hourIdx >= 0) {
        grid[dayIdx][hourIdx] += session.total_kwh ?? 1
      }
    })

    const maxValue = Math.max(1, ...grid.flat())
    return { grid, maxValue }
  }, [sessions])

  const intensityColor = (value: number): string => {
    if (value === 0) return "bg-slate-100"
    const t = value / maxValue
    if (t < 0.2) return "bg-[#2596be]/15"
    if (t < 0.4) return "bg-[#2596be]/30"
    if (t < 0.6) return "bg-[#2596be]/50"
    if (t < 0.8) return "bg-[#2596be]/70"
    return "bg-[#102472]"
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No charging data yet
      </div>
    )
  }

  return (
    <div>
      {/* Hour labels */}
      <div className="mb-1.5 grid grid-cols-[1.5rem_1fr]">
        <div />
        <div className="grid grid-cols-8 gap-[3px]">
          {HOURS.map((h) => (
            <span
              key={h}
              className="text-center text-[9px] font-medium tabular-nums text-muted-foreground"
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>

      {/* Day rows */}
      <div className="space-y-[3px]">
        {DAYS.map((day, dayIdx) => (
          <div key={day} className="grid grid-cols-[1.5rem_1fr] items-center">
            <span className="text-[9px] font-medium text-muted-foreground">
              {day}
            </span>
            <div className="grid grid-cols-8 gap-[3px]">
              {HOURS.map((_, hourIdx) => {
                const value = grid[dayIdx][hourIdx]
                return (
                  <div
                    key={hourIdx}
                    className={`h-5 w-full rounded-[2px] transition-colors duration-300 ${intensityColor(
                      value
                    )}`}
                    title={`${day} ${String(HOURS[hourIdx]).padStart(
                      2,
                      "0"
                    )}:00 — ${value.toFixed(1)} kWh`}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="text-[9px] text-muted-foreground">Méně</span>
        <div className="flex gap-[2px]">
          {["bg-slate-100", "bg-[#2596be]/20", "bg-[#2596be]/40", "bg-[#2596be]/60", "bg-[#102472]"].map(
            (c, i) => (
              <div key={i} className={`h-2.5 w-2.5 rounded-[1px] ${c}`} />
            )
          )}
        </div>
        <span className="text-[9px] text-muted-foreground">Více</span>
      </div>
    </div>
  )
}
