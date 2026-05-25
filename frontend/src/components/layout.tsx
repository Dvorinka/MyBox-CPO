import { Zap } from "lucide-react"
import { Link } from "react-router-dom"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center px-4 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#102472]">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-[#102472]">
              MyBox CPO
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-4 text-sm font-medium text-muted-foreground">
            <span className="hidden sm:inline">Fleet Dashboard</span>
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-600">Live</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        {children}
      </main>
      <footer className="mx-auto max-w-[1400px] px-4 py-6 text-center text-xs text-muted-foreground md:px-8">
        MyBox CPO Platform &middot; Mini fleet management demo
      </footer>
    </div>
  )
}
