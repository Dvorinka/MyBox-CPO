import { useState, useEffect } from "react"
import { Routes, Route } from "react-router-dom"
import { Toaster } from "sonner"
import Layout from "@/components/layout"
import Dashboard from "@/pages/dashboard"
import LoginForm from "@/components/login-form"
import { api } from "@/lib/api"

function App() {
  const [authenticated, setAuthenticated] = useState(api.isAuthenticated())

  const handleLogin = () => setAuthenticated(true)
  const handleLogout = () => {
    api.logout()
    setAuthenticated(false)
  }

  useEffect(() => {
    const onExpired = () => {
      setAuthenticated(false)
    }
    window.addEventListener("mybox:auth:expired", onExpired)
    return () => window.removeEventListener("mybox:auth:expired", onExpired)
  }, [])

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
