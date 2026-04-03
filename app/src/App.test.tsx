import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./lib/supabase', () => {
  const session = null
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session } }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
      },
    },
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('App', () => {
  it('muestra la página de login cuando no hay sesión', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: /control de gastos/i }),
    ).toBeInTheDocument()
  })
})
