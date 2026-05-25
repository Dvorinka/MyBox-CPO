import { useState } from "react"
import { Routes, Route } from "react-router-dom"
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

  return (
    <Layout onLogout={authenticated ? handleLogout : undefined}>
      {authenticated ? (
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </Layout>
  )
}

export default App
