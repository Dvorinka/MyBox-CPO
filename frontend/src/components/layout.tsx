import { useState } from "react"
import { Zap, LogOut, Settings } from "lucide-react"
import { Link } from "react-router-dom"
import { useI18n } from "@/lib/i18n"
import LanguageSwitcher from "@/components/language-switcher"
import ThemeToggle from "@/components/theme-toggle"
import PricingSettings from "@/components/pricing-settings"

export default function Layout({
  children,
  onLogout,
}: {
  children: React.ReactNode
  onLogout?: () => void
}) {
  const { t } = useI18n()
  const [pricingOpen, setPricingOpen] = useState(false)

  return (
    <div className="min-h-[100dvh] bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center px-4 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-primary">
              {t("appTitle")}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <span className="hidden sm:inline">{t("fleetDashboard")}</span>
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs text-accent">{t("live")}</span>
            <ThemeToggle />
            <LanguageSwitcher />
            {onLogout && (
              <>
                <button
                  onClick={() => setPricingOpen(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-md p-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title={t("pricingSettings")}
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-muted transition-colors"
                  title={t("logout")}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("logout")}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        {children}
      </main>
      <footer className="mx-auto max-w-[1400px] px-4 py-6 text-center text-xs text-muted-foreground md:px-8">
        {t("footer")}
      </footer>

      <PricingSettings open={pricingOpen} onOpenChange={setPricingOpen} />
    </div>
  )
}
