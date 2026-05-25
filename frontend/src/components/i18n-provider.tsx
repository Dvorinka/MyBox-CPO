import { useState, useCallback } from "react"
import { I18nContext, translate, type Locale } from "@/lib/i18n"

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem("mybox-locale")
    if (stored === "cs" || stored === "en") return stored
    return "cs"
  })

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem("mybox-locale", l)
    setLocaleState(l)
  }, [])

  const t = useCallback(
    (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  )

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}
