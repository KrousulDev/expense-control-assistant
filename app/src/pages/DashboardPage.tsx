import { useEffect, useState } from 'react'
import { TrendingDown, TrendingUp, Scale } from 'lucide-react'
import { transactionsService } from '../services/transactionsService'
import { categoriesService } from '../services/categoriesService'
import type { Transaction, Category } from '../types'

interface MonthlySummary {
  totalExpenses: number
  totalIncome: number
  balance: number
}

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00`
}

function endOfMonth(d: Date): string {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return next.toISOString()
}

export function DashboardPage() {
  const [summary, setSummary] = useState<MonthlySummary>({
    totalExpenses: 0,
    totalIncome: 0,
    balance: 0,
  })
  const [recentTx, setRecentTx] = useState<
    (Transaction & { category_name?: string })[]
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const from = startOfMonth(now)
    const to = endOfMonth(now)

    async function load() {
      const [transactions, categories] = await Promise.all([
        transactionsService.list({ from, to, pageSize: 100 }),
        categoriesService.list(),
      ])

      const catMap = new Map((categories as Category[]).map((c) => [c.id, c.name]))

      const totalExpenses = transactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0)

      const totalIncome = transactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0)

      setSummary({ totalExpenses, totalIncome, balance: totalIncome - totalExpenses })

      setRecentTx(
        transactions.slice(0, 10).map((t) => ({
          ...t,
          category_name: t.category_id ? (catMap.get(t.category_id) ?? '—') : '—',
        })),
      )
      setLoading(false)
    }

    void load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    )
  }

  const fmt = (n: number) =>
    n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const monthLabel = new Date().toLocaleDateString('es-MX', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Dashboard</h2>
      <p className="text-sm text-gray-500 mb-6 capitalize">{monthLabel}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Gastos
          </div>
          <p className="text-2xl font-semibold text-gray-900">${fmt(summary.totalExpenses)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Ingresos
          </div>
          <p className="text-2xl font-semibold text-gray-900">${fmt(summary.totalIncome)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Scale className="h-4 w-4 text-violet-500" />
            Balance
          </div>
          <p className={`text-2xl font-semibold ${summary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${fmt(summary.balance)}
          </p>
        </div>
      </div>

      <h3 className="text-sm font-medium text-gray-900 mb-3">Movimientos recientes</h3>

      {recentTx.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No hay movimientos este mes.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(tx.occurred_at).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {tx.description ?? tx.raw_user_text ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{tx.category_name}</td>
                  <td className={`px-4 py-3 text-right font-medium ${tx.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                    {tx.type === 'expense' ? '-' : '+'}${fmt(Number(tx.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
