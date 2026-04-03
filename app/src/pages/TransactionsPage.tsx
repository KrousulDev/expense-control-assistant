import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../../../db/generated/database.types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Category = Database['public']['Tables']['categories']['Row']

const PAGE_SIZE = 20

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<
    (Transaction & { category_name?: string })[]
  >([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>(
    'all',
  )

  useEffect(() => {
    async function load() {
      setLoading(true)

      let query = supabase
        .from('transactions')
        .select('*')
        .order('occurred_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter)
      }

      const [txResult, catResult] = await Promise.all([
        query,
        supabase.from('categories').select('id, name'),
      ])

      const rows = txResult.data ?? []
      const categories = (catResult.data ?? []) as Category[]
      const catMap = new Map(categories.map((c) => [c.id, c.name]))

      setTransactions(
        rows.map((t) => ({
          ...t,
          category_name: t.category_id
            ? (catMap.get(t.category_id) ?? '—')
            : '—',
        })),
      )
      setHasMore(rows.length === PAGE_SIZE)
      setLoading(false)
    }

    void load()
  }, [page, typeFilter])

  const fmt = (n: number) =>
    n.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const channelLabel = (ch: string) => {
    const labels: Record<string, string> = {
      whatsapp: 'WhatsApp',
      web: 'Web',
      api: 'API',
    }
    return labels[ch] ?? ch
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Movimientos</h2>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as typeof typeFilter)
            setPage(0)
          }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
        </div>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No hay movimientos.
        </p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Canal</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(tx.occurred_at).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {tx.description ?? tx.raw_user_text ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {tx.category_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {channelLabel(tx.source_channel)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${tx.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {tx.type === 'expense' ? '-' : '+'}$
                      {fmt(Number(tx.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-4">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="text-sm text-violet-600 hover:text-violet-700 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-500">Página {page + 1}</span>
            <button
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="text-sm text-violet-600 hover:text-violet-700 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  )
}
