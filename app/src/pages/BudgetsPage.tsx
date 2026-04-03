import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Plus, Trash2 } from 'lucide-react'
import type { Database } from '../../../db/generated/database.types'

type Budget = Database['public']['Tables']['budgets']['Row']
type Category = Database['public']['Tables']['categories']['Row']

interface BudgetWithProgress extends Budget {
  category_name: string | null
  spent: number
}

function firstDayOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function monthRange(monthStr: string) {
  const d = new Date(monthStr + 'T00:00:00')
  const start = d.toISOString()
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString()
  return { start, end }
}

export function BudgetsPage() {
  const { user } = useAuth()
  const [month, setMonth] = useState(firstDayOfMonth(new Date()))
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [formCategoryId, setFormCategoryId] = useState<string>('')
  const [formAmount, setFormAmount] = useState('')
  const [formCurrency, setFormCurrency] = useState('MXN')
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const { start, end } = monthRange(month)

    const [budgetRes, catRes, txRes] = await Promise.all([
      supabase.from('budgets').select('*').eq('month', month),
      supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true }),
      supabase
        .from('transactions')
        .select('amount, category_id')
        .eq('type', 'expense')
        .gte('occurred_at', start)
        .lt('occurred_at', end),
    ])

    const allBudgets = (budgetRes.data ?? []) as Budget[]
    const allCategories = (catRes.data ?? []) as Category[]
    const txRows = txRes.data ?? []

    setCategories(allCategories)
    const catMap = new Map(allCategories.map((c) => [c.id, c.name]))

    const spentByCategory = new Map<string | null, number>()
    let totalSpent = 0
    for (const tx of txRows) {
      const amt = Number(tx.amount)
      totalSpent += amt
      const key = tx.category_id
      spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + amt)
    }

    setBudgets(
      allBudgets.map((b) => ({
        ...b,
        category_name: b.category_id ? (catMap.get(b.category_id) ?? null) : null,
        spent: b.category_id
          ? (spentByCategory.get(b.category_id) ?? 0)
          : totalSpent,
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)

    await supabase.from('budgets').insert({
      user_id: user.id,
      month,
      category_id: formCategoryId || null,
      amount_limit: parseFloat(formAmount),
      currency: formCurrency.toUpperCase(),
    })

    setSaving(false)
    setShowForm(false)
    setFormAmount('')
    setFormCategoryId('')
    await loadData()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('budgets').delete().eq('id', id)
    await loadData()
  }

  const fmt = (n: number) =>
    n.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const pct = (spent: number, limit: number) =>
    Math.min(Math.round((spent / limit) * 100), 100)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Presupuestos</h2>
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(e.target.value + '-01')}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 bg-violet-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="bg-white rounded-xl border border-gray-200 p-4 mb-6 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Categoría (vacío = global)
              </label>
              <select
                value={formCategoryId}
                onChange={(e) => setFormCategoryId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Global (todas)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Límite
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="10000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Moneda
              </label>
              <input
                type="text"
                required
                maxLength={3}
                value={formCurrency}
                onChange={(e) => setFormCurrency(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
        </div>
      ) : budgets.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No hay presupuestos para este mes.
        </p>
      ) : (
        <div className="space-y-3">
          {budgets.map((b) => {
            const percent = pct(b.spent, Number(b.amount_limit))
            const overBudget = b.spent > Number(b.amount_limit)

            return (
              <div
                key={b.id}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      {b.category_name ?? 'Global'}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {b.currency}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      ${fmt(b.spent)} / ${fmt(Number(b.amount_limit))}
                    </span>
                    <button
                      onClick={() => void handleDelete(b.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      overBudget ? 'bg-red-500' : 'bg-violet-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                {overBudget && (
                  <p className="text-xs text-red-600 mt-1">
                    Excedido por ${fmt(b.spent - Number(b.amount_limit))}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
