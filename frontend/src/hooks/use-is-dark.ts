import { useTheme } from "@/components/theme-provider"

export function useIsDark() {
  const { theme } = useTheme()
  return theme === "dark"
}
