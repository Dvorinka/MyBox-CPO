import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { I18nProvider } from "@/components/i18n-provider"
import LoginForm from "./login-form"

vi.mock("@/lib/api", () => ({
  api: {
    login: vi.fn().mockResolvedValue({ token: "test", type: "Bearer" }),
    logout: vi.fn(),
    isAuthenticated: vi.fn().mockReturnValue(false),
  },
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

describe("LoginForm", () => {
  it("renders username and password inputs", () => {
    render(<LoginForm onLogin={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByLabelText(/Uživatelské jméno/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Heslo/i)).toBeInTheDocument()
  })

  it("calls onLogin after successful submit", async () => {
    const onLogin = vi.fn()
    render(<LoginForm onLogin={onLogin} />, { wrapper: Wrapper })

    const usernameInput = screen.getByLabelText(/Uživatelské jméno/i)
    const passwordInput = screen.getByLabelText(/Heslo/i)
    const submitButton = screen.getByRole("button", { name: /Přihlášení/i })

    fireEvent.change(usernameInput, { target: { value: "admin" } })
    fireEvent.change(passwordInput, { target: { value: "admin" } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalled()
    })
  })
})
