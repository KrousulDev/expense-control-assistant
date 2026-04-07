import { useCallback, useEffect, useState } from 'react'
import { transactionsService } from '../services/transactionsService'
import { categoriesService } from '../services/categoriesService'
import { TransactionModal } from '../components/TransactionModal'
import { DeleteConfirmDialog } from '../components/DeleteConfirmDialog'
import type { Transaction, Category } from '../types'

const PAGE_SIZE = 20

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<
    (Transaction & { category_name?: string })[]
  >([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [editingTx, setEditingTx] = useState<
    (Transaction & { category_name?: string }) | null
  >(null)
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null)

  const load = useCallback(async () => {
    setLoading(true)

    const [rows, cats] = await Promise.all([
      transactionsService.list({
        page,
        pageSize: PAGE_SIZE,
        type: typeFilter === 'all' ? undefined : typeFilter,
      }),
      categoriesService.list(),
    ])

    const catMap = new Map((cats as Category[]).map((c) => [c.id, c.name]))
    setCategories(cats as Category[])
    setTransactions(
      rows.map((t) => ({
        ...t,
        category_name: t.category_id ? (catMap.get(t.category_id) ?? '—') : '—',
      })),
    )
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }, [page, typeFilter])

  useEffect(() => {
    void load()
  }, [load])

  const fmt = (n: number) =>
    n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const channelLabel = (ch: string) => {
    const labels: Record<string, string> = { whatsapp: 'WhatsApp', web: 'Web', api: 'API' }
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
        <p className="text-sm text-gray-500 py-8 text-center">No hay movimientos.</p>
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
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50 last:border-0">
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
                    <td className="px-4 py-3 text-gray-600">{tx.category_name}</td>
                    <td className="px-4 py-3 text-gray-600">{channelLabel(tx.source_channel)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${tx.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                      {tx.type === 'expense' ? '-' : '+'}${fmt(Number(tx.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingTx(tx)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeletingTx(tx)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Eliminar"
                          title="Eliminar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
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

      {editingTx && (
        <TransactionModal
          transaction={editingTx}
          categories={categories}
          onClose={() => setEditingTx(null)}
          onSaved={() => {
            setEditingTx(null)
            void load()
          }}
        />
      )}

      {deletingTx && (
        <DeleteConfirmDialog
          transaction={deletingTx}
          onClose={() => setDeletingTx(null)}
          onDeleted={() => {
            setDeletingTx(null)
            void load()
          }}
        />
      )}
    </div>
  )
}
