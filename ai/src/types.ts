export interface InterpretInput {
  text: string
  defaultCurrency: string
  categorySlugs: string[]
}

export interface InterpretResult {
  type: 'expense' | 'income'
  amount: number
  currency: string
  categorySlug: string | null
  description: string
  confidence: number
  rawModelMeta: Record<string, unknown>
}
