import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Database } from '../../../db/generated/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

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
    if (!user) return
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single()

      if (data) {
        setProfile(data)
        setDisplayName(data.display_name ?? '')
        setPhone(data.whatsapp_phone_e164 ?? '')
        setDefaultCurrency(data.default_currency)
        setTimezone(data.timezone)
      }
      setLoading(false)
    }
    void load()
  }, [user])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setMessage(null)

    if (phone && !PHONE_E164_RE.test(phone)) {
      setMessage({
        type: 'error',
        text: 'El teléfono debe tener formato E.164 (ej: +5215512345678)',
      })
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName || null,
        whatsapp_phone_e164: phone || null,
        default_currency: defaultCurrency.toUpperCase(),
        timezone,
      })
      .eq('id', user.id)

    setSaving(false)
    if (error) {
      const text =
        (error as { code?: string }).code === '23505'
          ? 'Ese número de WhatsApp ya está registrado en otra cuenta.'
          : error.message
      setMessage({ type: 'error', text })
    } else {
      setMessage({ type: 'success', text: 'Perfil actualizado.' })
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre
          </label>
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
            Teléfono WhatsApp
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            placeholder="+5215512345678"
          />
          <p className="text-xs text-gray-500 mt-1">
            Formato E.164 con código de país. Este número se usa para vincular
            tus mensajes de WhatsApp con tu cuenta.
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
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Información de la cuenta
          </h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd className="text-gray-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="text-gray-900 font-mono text-xs">
                {profile.id}
              </dd>
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
