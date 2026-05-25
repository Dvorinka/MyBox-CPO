import { Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n()

  const toggle = () => {
    setLocale(locale === "en" ? "cs" : "en")
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="h-7 gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
    >
      <Globe className="h-3 w-3" />
      {locale === "en" ? "EN" : "CS"}
    </Button>
  )
}
