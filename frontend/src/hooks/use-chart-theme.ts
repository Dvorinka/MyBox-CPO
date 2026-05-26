import { useIsDark } from "./use-is-dark"

export interface ChartTheme {
  isDark: boolean
  gridStroke: string
  tickFill: string
  tooltipStyle: React.CSSProperties
  primary: string
  primaryDark: string
  accent: string
  accentDark: string
  destructive: string
  destructiveDark: string
}

export function useChartTheme(): ChartTheme {
  const isDark = useIsDark()

  const gridStroke = isDark ? "#1f1f1f" : "#e2e8f0"
  const tickFill = isDark ? "#8e8e8e" : "#64748b"

  return {
    isDark,
    gridStroke,
    tickFill,
    tooltipStyle: {
      borderRadius: "8px",
      border: `1px solid ${gridStroke}`,
      boxShadow: "none",
      backgroundColor: isDark ? "#111111" : "#ffffff",
      color: isDark ? "#ffffff" : "#0f172a",
    },
    primary: isDark ? "#3b82f6" : "#102472",
    primaryDark: isDark ? "#102472" : "#3b82f6",
    accent: isDark ? "#2596be" : "#2596be",
    accentDark: isDark ? "#38bdf8" : "#38bdf8",
    destructive: isDark ? "#ef4444" : "#ef4444",
    destructiveDark: isDark ? "#ef4444" : "#ef4444",
  }
}
