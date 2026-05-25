import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router-dom"
import { StationsProvider } from "@/hooks/use-stations"
import { I18nProvider } from "@/components/i18n-provider"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider>
          <StationsProvider>
            <App />
          </StationsProvider>
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
