import { useState, useEffect } from "react"
import { Routes, Route } from "react-router-dom"
import { Toaster } from "sonner"
import Layout from "@/components/layout"
import Dashboard from "@/pages/dashboard"
import LoginForm from "@/components/login-form"
import { api } from "@/lib/api"

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.isAuthenticated().then((ok) => {
      setAuthenticated(ok)
      setLoading(false)
    })
  }, [])

  const handleLogin = () => setAuthenticated(true)
  const handleLogout = async () => {
    await api.logout()
    setAuthenticated(false)
  }

  useEffect(() => {
    const onExpired = () => setAuthenticated(false)
    window.addEventListener("mybox:auth:expired", onExpired)
    return () => window.removeEventListener("mybox:auth:expired", onExpired)
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <Layout onLogout={authenticated ? handleLogout : undefined}>
      {authenticated ? (
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
      <Toaster position="top-right" richColors closeButton />
    </Layout>
  )
}

export default App
