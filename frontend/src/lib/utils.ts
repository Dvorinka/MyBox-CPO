import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Deterministic lat/lng around Prague for demo stations based on id hash */
export function getStationLocation(id: string): { latitude: number; longitude: number } {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const lat = 50.0755 + (hash % 1000) / 2500
  const lng = 14.4378 + ((hash >> 4) % 1000) / 2500
  return { latitude: Number(lat.toFixed(4)), longitude: Number(lng.toFixed(4)) }
}
