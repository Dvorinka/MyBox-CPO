import type { Station } from "@/types"

export function statusVariant(status: Station["status"]) {
  switch (status) {
    case "Available":
      return "available" as const
    case "Preparing":
      return "preparing" as const
    case "Charging":
      return "charging" as const
    case "Finishing":
      return "finishing" as const
    case "Faulted":
      return "faulted" as const
    case "Offline":
      return "offline" as const
    default:
      return "outline" as const
  }
}

export function statusDotColor(status: Station["status"]) {
  switch (status) {
    case "Available":
      return "bg-[#2596be] dark:bg-[#38bdf8]"
    case "Preparing":
      return "bg-amber-500 dark:bg-amber-400"
    case "Charging":
      return "bg-[#102472] dark:bg-[#3b82f6]"
    case "Finishing":
      return "bg-slate-400 dark:bg-slate-400"
    case "Faulted":
      return "bg-red-500 dark:bg-red-400"
    case "Offline":
      return "bg-gray-300 dark:bg-gray-500"
  }
}
