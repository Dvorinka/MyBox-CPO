import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Deterministic lat/lng spread across Prague region for demo stations based on id hash */
export function getStationLocation(id: string): { latitude: number; longitude: number } {
  let h1 = 0, h2 = 0
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i)
    h1 = ((h1 << 5) - h1 + c + i * 31) | 0
    h2 = ((h2 << 7) - h2 + c * 17 + i) | 0
  }
  // Spread stations wide across Prague region (~±30 km N/S, ±40 km E/W)
  const latOffset = ((Math.abs(h1) % 10000) / 10000 - 0.5) * 0.55
  const lngOffset = ((Math.abs(h2) % 10000) / 10000 - 0.5) * 0.70
  const lat = 50.0755 + latOffset
  const lng = 14.4378 + lngOffset
  return { latitude: Number(lat.toFixed(4)), longitude: Number(lng.toFixed(4)) }
}
