import { useState } from 'react'
import { transactionsService } from '../services/transactionsService'
import type { Transaction } from '../types'

interface Props {
  transaction: Transaction
  onClose: () => void
  onDeleted: () => void
}

export function DeleteConfirmDialog({ transaction, onClose, onDeleted }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = transaction.description ?? transaction.raw_user_text ?? 'este movimiento'

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    try {
      await transactionsService.remove(transaction.id)
      onDeleted()
    } catch {
      setError('Error al eliminar. Intenta de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Eliminar movimiento</h3>
            <p className="mt-1 text-sm text-gray-600">
              ¿Estás seguro de que deseas eliminar{' '}
              <span className="font-medium text-gray-900">"{label}"</span>?
              Esta acción no se puede deshacer.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}
