import OpenAI from 'openai'
import { z } from 'zod'
import type { InterpretInput, InterpretResult } from './types'

const responseSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive(),
  currency: z.string().length(3),
  category_slug: z.string().nullable(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
})

function buildPrompt(input: InterpretInput): string {
  return `Eres un asistente financiero. Interpreta el siguiente mensaje del usuario y extrae la información de la transacción financiera.

Categorías disponibles (slugs): ${input.categorySlugs.join(', ')}
Moneda por defecto del usuario: ${input.defaultCurrency}

Reglas:
- Si el usuario menciona un gasto, type = "expense". Si menciona un ingreso/pago recibido/salario, type = "income".
- Extrae el monto numérico. "20k" = 20000. "500 pesos" = 500.
- Si el usuario menciona una moneda (usd, dólares, euros), úsala. Si no, usa la moneda por defecto.
- Asigna el category_slug más apropiado de la lista. Si no hay ninguna que encaje bien, devuelve null.
- description: resumen corto de lo que el usuario describió.
- confidence: qué tan seguro estás de la interpretación (0 a 1).

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{"type": "expense"|"income", "amount": number, "currency": "XXX", "category_slug": "slug"|null, "description": "...", "confidence": 0.0-1.0}

Mensaje del usuario: "${input.text}"`
}

export async function interpret(
  input: InterpretInput,
  openaiClient?: OpenAI,
): Promise<InterpretResult> {
  const client = openaiClient ?? new OpenAI()

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    messages: [{ role: 'user', content: buildPrompt(input) }],
    response_format: { type: 'json_object' },
  })

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new Error('Empty response from OpenAI')

  const parsed = JSON.parse(raw) as Record<string, unknown>
  const validated = responseSchema.parse(parsed)

  return {
    type: validated.type,
    amount: validated.amount,
    currency: validated.currency.toUpperCase(),
    categorySlug: validated.category_slug,
    description: validated.description,
    confidence: validated.confidence,
    rawModelMeta: {
      model: completion.model,
      usage: completion.usage,
      raw: parsed,
    },
  }
}

export { buildPrompt as _buildPromptForTesting }
