import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { profileService } from '../services/profileService'
import { ApiError } from '../lib/apiClient'
import type { Profile } from '../types'

const PHONE_E164_RE = /^\+[1-9]\d{7,14}$/

export function SettingsPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [defaultCurrency, setDefaultCurrency] = useState('MXN')
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await profileService.get()
        setProfile(data)
        setDisplayName(data.display_name ?? '')
        setPhone(data.whatsapp_phone_e164 ?? '')
        setDefaultCurrency(data.default_currency)
        setTimezone(data.timezone)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (phone && !PHONE_E164_RE.test(phone)) {
      setMessage({
        type: 'error',
        text: 'El teléfono debe tener formato E.164 (ej: +5215512345678)',
      })
      return
    }

    setSaving(true)
    try {
      const updated = await profileService.update({
        displayName: displayName || null,
        whatsappPhoneE164: phone || null,
        defaultCurrency: defaultCurrency.toUpperCase(),
        timezone,
      })
      setProfile(updated)
      setMessage({ type: 'success', text: 'Perfil actualizado.' })
    } catch (err) {
      const text =
        err instanceof ApiError
          ? err.message
          : 'Error al guardar. Intenta de nuevo.'
      setMessage({ type: 'error', text })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Ajustes</h2>

      <form
        onSubmit={(e) => void handleSave(e)}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="Tu nombre"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Teléfono (E.164)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="+5215512345678"
          />
          <p className="text-xs text-gray-500 mt-1">
            Formato E.164 con código de país.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Moneda por defecto
            </label>
            <input
              type="text"
              required
              maxLength={3}
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zona horaria
            </label>
            <input
              type="text"
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {message && (
          <p
            role="alert"
            className={`text-sm rounded-lg px-3 py-2 ${
              message.type === 'success'
                ? 'text-green-700 bg-green-50'
                : 'text-red-600 bg-red-50'
            }`}
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      {profile && (
        <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Información de la cuenta</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="text-gray-900 font-mono text-xs">{profile.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Creado</dt>
              <dd className="text-gray-900">
                {new Date(profile.created_at).toLocaleDateString('es-MX')}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}
