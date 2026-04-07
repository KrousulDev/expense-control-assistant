import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./lib/apiClient', () => ({
  getToken: vi.fn().mockReturnValue(null),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    readonly status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

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
