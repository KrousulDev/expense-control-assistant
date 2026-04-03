import { describe, it, expect, vi, beforeEach } from 'vitest'
import { interpret, _buildPromptForTesting } from './interpret'
import type { InterpretInput } from './types'

const SYSTEM_SLUGS = [
  'comida',
  'transporte',
  'vivienda',
  'salud',
  'entretenimiento',
  'educacion',
  'servicios',
  'compras',
  'deuda',
  'salario',
  'otros_ingresos',
  'otros_gastos',
]

function makeMockOpenAI(response: Record<string, unknown>) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          model: 'gpt-4o-mini',
          usage: { prompt_tokens: 10, completion_tokens: 10 },
          choices: [
            { message: { content: JSON.stringify(response) } },
          ],
        }),
      },
    },
  } as never
}

const baseInput: InterpretInput = {
  text: '',
  defaultCurrency: 'MXN',
  categorySlugs: SYSTEM_SLUGS,
}

describe('interpret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('interpreta "gasté 20k en comida" como gasto', async () => {
    const mock = makeMockOpenAI({
      type: 'expense',
      amount: 20000,
      currency: 'MXN',
      category_slug: 'comida',
      description: 'Gasto en comida',
      confidence: 0.95,
    })

    const result = await interpret(
      { ...baseInput, text: 'gasté 20k en comida' },
      mock,
    )

    expect(result.type).toBe('expense')
    expect(result.amount).toBe(20000)
    expect(result.currency).toBe('MXN')
    expect(result.categorySlug).toBe('comida')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('interpreta "me pagaron 500 usd" como ingreso', async () => {
    const mock = makeMockOpenAI({
      type: 'income',
      amount: 500,
      currency: 'USD',
      category_slug: 'salario',
      description: 'Pago recibido',
      confidence: 0.9,
    })

    const result = await interpret(
      { ...baseInput, text: 'me pagaron 500 usd' },
      mock,
    )

    expect(result.type).toBe('income')
    expect(result.amount).toBe(500)
    expect(result.currency).toBe('USD')
    expect(result.categorySlug).toBe('salario')
  })

  it('devuelve categorySlug null cuando la categoría no encaja', async () => {
    const mock = makeMockOpenAI({
      type: 'expense',
      amount: 150,
      currency: 'MXN',
      category_slug: null,
      description: 'Gasto no categorizado',
      confidence: 0.6,
    })

    const result = await interpret(
      { ...baseInput, text: 'pagué 150 pesos de algo raro' },
      mock,
    )

    expect(result.categorySlug).toBeNull()
  })

  it('usa la moneda por defecto si el usuario no especifica', async () => {
    const mock = makeMockOpenAI({
      type: 'expense',
      amount: 300,
      currency: 'MXN',
      category_slug: 'transporte',
      description: 'Uber',
      confidence: 0.9,
    })

    const result = await interpret(
      { ...baseInput, text: 'uber 300' },
      mock,
    )

    expect(result.currency).toBe('MXN')
  })

  it('lanza error si OpenAI devuelve respuesta vacía', async () => {
    const mock = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'gpt-4o-mini',
            choices: [{ message: { content: null } }],
          }),
        },
      },
    } as never

    await expect(
      interpret({ ...baseInput, text: 'hola' }, mock),
    ).rejects.toThrow('Empty response from OpenAI')
  })
})

describe('buildPrompt', () => {
  it('incluye las categorías y la moneda del usuario', () => {
    const prompt = _buildPromptForTesting({
      text: 'gasté 100 en comida',
      defaultCurrency: 'MXN',
      categorySlugs: ['comida', 'transporte'],
    })

    expect(prompt).toContain('comida, transporte')
    expect(prompt).toContain('MXN')
    expect(prompt).toContain('gasté 100 en comida')
  })
})
