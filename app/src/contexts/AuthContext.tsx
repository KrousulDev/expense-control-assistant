import { useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './auth-context'
import { authService } from '../services/authService'
import { getToken, clearToken } from '../lib/apiClient'
import type { User } from '../types'

function parseUserFromToken(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { id: payload.sub as string, email: payload.email as string }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (token) {
      const parsed = parseUserFromToken(token)
      setUser(parsed)
    }
    setLoading(false)
  }, [])

  const signIn = async (email: string, password: string) => {
    await authService.login(email, password)
    const token = getToken()
    if (token) setUser(parseUserFromToken(token))
  }

  const signUp = async (email: string, password: string) => {
    await authService.register(email, password)
    const token = getToken()
    if (token) setUser(parseUserFromToken(token))
  }

  const signOut = () => {
    authService.logout()
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
