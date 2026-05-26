import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { api, type PricingSettings } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { Loader2, Save } from "lucide-react"

interface PricingSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function PricingSettings({ open, onOpenChange }: PricingSettingsProps) {
  const { t } = useI18n()
  const [settings, setSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    setSaved(false)
    setError(null)
    setLoading(true)
    api.getPricing()
      .then((data) => setSettings(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [open])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      await api.setPricing({
        peak_price_per_kwh: settings.peak_price_per_kwh,
        offpeak_price_per_kwh: settings.offpeak_price_per_kwh,
        peak_start_hour: settings.peak_start_hour,
        peak_end_hour: settings.peak_end_hour,
        dc_multiplier: settings.dc_multiplier,
      })
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const update = (field: keyof PricingSettings, value: number) => {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev))
    setSaved(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl tracking-tight">{t("pricingSettings")}</DialogTitle>
          <DialogDescription>
            {t("peakHours")}: {settings?.peak_start_hour ?? "—"}:00 – {settings?.peak_end_hour ?? "—"}:00
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error && !settings ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : settings ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("peakPrice")}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.peak_price_per_kwh}
                  onChange={(e) => update("peak_price_per_kwh", parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("offPeakPrice")}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.offpeak_price_per_kwh}
                  onChange={(e) => update("offpeak_price_per_kwh", parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("peakStart")}</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.peak_start_hour}
                  onChange={(e) => update("peak_start_hour", Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("peakEnd")}</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.peak_end_hour}
                  onChange={(e) => update("peak_end_hour", Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("dcMultiplier")}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.dc_multiplier}
                  onChange={(e) => update("dc_multiplier", parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {saved && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                {t("pricingUpdated")}
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("savePricing")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
