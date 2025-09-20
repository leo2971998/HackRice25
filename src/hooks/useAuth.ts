import * as React from "react"

type User = {
  name: string
  email: string
  avatarUrl?: string
}

type AuthState = {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
}

type UseAuthReturn = AuthState & {
  login: () => Promise<void>
  logout: () => Promise<void>
}

const demoUser: User = {
  name: "Avery Johnson",
  email: "avery@example.com",
  avatarUrl: "https://avatar.vercel.sh/avery",
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = React.useState<AuthState>({
    user: demoUser,
    isAuthenticated: true,
    loading: false,
  })

  const login = React.useCallback(async () => {
    setState({ user: demoUser, isAuthenticated: true, loading: false })
  }, [])

  const logout = React.useCallback(async () => {
    setState({ user: null, isAuthenticated: false, loading: false })
  }, [])

  return { ...state, login, logout }
}
