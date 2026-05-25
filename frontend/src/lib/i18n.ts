import { createContext, useContext } from "react"

export type Locale = "en" | "cs"

interface I18nContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: keyof typeof dictionary.en, vars?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nContextType | null>(null)

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}

const dictionary = {
  en: {
    // Layout
    appTitle: "MyBox CPO",
    fleetDashboard: "Fleet Dashboard",
    live: "Live",
    footer: "MyBox CPO Platform · Mini fleet management demo",

    // Dashboard
    fleetOverview: "Fleet Overview",
    realTimeMonitoring: "Real-time monitoring of {{count}} charging stations",
    refresh: "Refresh",
    chargingNow: "Charging Now",
    ofStations: "of {{count}} stations",
    totalPower: "Total Power",
    totalEnergy: "Total Energy",
    available: "Available",
    faulted: "faulted",
    stations: "Stations",
    chargingActivity: "Charging Activity",
    analytics: "Analytics",
    noStationsConnected: "No stations connected",
    noChargingDataYet: "No charging data yet",
    apiConnectionIssue: "API connection issue: {{error}}",
    currentPower: "Current Power",
    max: "max",
    updatedAt: "Updated {{time}}",
    neverSeen: "Never seen",
    details: "Details",
    startCharging: "Start Charging",
    stopCharging: "Stop Charging",
    starting: "Starting...",
    stopping: "Stopping...",

    // Station Detail
    overview: "Overview",
    sessions: "Sessions",
    powerHistory: "Power History (last 30 min)",
    activeTransaction: "Active Transaction",
    none: "None",
    noMeterDataAvailable: "No meter data available",
    noChargingSessionsRecorded: "No charging sessions recorded",
    startTime: "Start Time",
    endTime: "End Time",
    energy: "Energy",
    duration: "Duration",
    tariff: "Tariff",
    cost: "Cost",
    inProgress: "In progress",
    location: "Location",
    stationFaulted: "Station Faulted",
    stationFaultedDesc: "This station is reporting a fault. Please check the hardware or contact support.",

    // Status
    statusAvailable: "Available",
    statusPreparing: "Preparing",
    statusCharging: "Charging",
    statusFinishing: "Finishing",
    statusFaulted: "Faulted",
    statusOffline: "Offline",

    // Analytics
    energyLast7Days: "Energy last 7 days",
    topStations: "Top 3 stations by usage",
    acVsDc: "AC vs DC charging",
    uptime: "Uptime %",
    sessionDuration: "Session duration",
    fleetMap: "Fleet Map",
    stationStatus: "Station Status",

    // Auth
    login: "Login",
    logout: "Logout",
    username: "Username",
    password: "Password",
    demoCredentials: "Demo: admin / admin",
    loginError: "Invalid credentials",

    // Language
    language: "Language",
    english: "English",
    czech: "Čeština",
  },
  cs: {
    // Layout
    appTitle: "MyBox CPO",
    fleetDashboard: "Dashboard flotily",
    live: "Živě",
    footer: "MyBox CPO Platforma · Demo správy flotily",

    // Dashboard
    fleetOverview: "Přehled flotily",
    realTimeMonitoring: "Real-time monitoring {{count}} nabíjecích stanic",
    refresh: "Aktualizovat",
    chargingNow: "Nabíjí se",
    ofStations: "z {{count}} stanic",
    totalPower: "Celkový výkon",
    totalEnergy: "Celková energie",
    available: "Dostupné",
    faulted: "chybné",
    stations: "Stanice",
    chargingActivity: "Aktivita nabíjení",
    analytics: "Analytika",
    noStationsConnected: "Žádné stanice nepřipojeny",
    noChargingDataYet: "Zatím žádná data o nabíjení",
    apiConnectionIssue: "Problém s připojením API: {{error}}",
    currentPower: "Aktuální výkon",
    max: "max",
    updatedAt: "Aktualizováno {{time}}",
    neverSeen: "Zatím nenalezeno",
    details: "Detaily",
    startCharging: "Zahájit nabíjení",
    stopCharging: "Ukončit nabíjení",
    starting: "Zahajování...",
    stopping: "Ukončování...",

    // Station Detail
    overview: "Přehled",
    sessions: "Sezení",
    powerHistory: "Historie výkonu (posledních 30 min)",
    activeTransaction: "Aktivní transakce",
    none: "Žádná",
    noMeterDataAvailable: "Nejsou dostupná data metru",
    noChargingSessionsRecorded: "Žádná zaznamenaná sezení",
    startTime: "Čas začátku",
    endTime: "Čas konce",
    energy: "Energie",
    duration: "Délka",
    tariff: "Tarif",
    cost: "Cena",
    inProgress: "Probíhá",
    location: "Poloha",
    stationFaulted: "Stanice v chybovém stavu",
    stationFaultedDesc: "Tato stanice hlásí chybu. Zkontrolujte hardware nebo kontaktujte podporu.",

    // Status
    statusAvailable: "Dostupná",
    statusPreparing: "Příprava",
    statusCharging: "Nabíjení",
    statusFinishing: "Dokončování",
    statusFaulted: "Chyba",
    statusOffline: "Offline",

    // Analytics
    energyLast7Days: "Energie posledních 7 dní",
    topStations: "Top 3 stanice podle využití",
    acVsDc: "AC vs DC nabíjení",
    uptime: "Dostupnost %",
    sessionDuration: "Délka sezení",
    fleetMap: "Mapa flotily",
    stationStatus: "Stav stanic",

    // Auth
    login: "Přihlášení",
    logout: "Odhlásit",
    username: "Uživatelské jméno",
    password: "Heslo",
    demoCredentials: "Demo: admin / admin",
    loginError: "Neplatné přihlašovací údaje",

    // Language
    language: "Jazyk",
    english: "English",
    czech: "Čeština",
  },
}

export function translate(locale: Locale, key: keyof typeof dictionary.en, vars?: Record<string, string | number>): string {
  let text = dictionary[locale][key] ?? dictionary.en[key] ?? key
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{{${k}}}`, String(v))
    })
  }
  return text
}
