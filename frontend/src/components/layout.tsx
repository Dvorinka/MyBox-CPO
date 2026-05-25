import { Zap } from "lucide-react"
import { Link } from "react-router-dom"
import { useI18n } from "@/lib/i18n"
import LanguageSwitcher from "@/components/language-switcher"

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()

  return (
    <div className="min-h-[100dvh] bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center px-4 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#102472]">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-[#102472]">
              {t("appTitle")}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <span className="hidden sm:inline">{t("fleetDashboard")}</span>
            <div className="h-2 w-2 rounded-full bg-[#2596be] animate-pulse" />
            <span className="text-xs text-[#2596be]">{t("live")}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        {children}
      </main>
      <footer className="mx-auto max-w-[1400px] px-4 py-6 text-center text-xs text-muted-foreground md:px-8">
        {t("footer")}
      </footer>
    </div>
  )
}
