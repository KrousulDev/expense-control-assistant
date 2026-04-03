import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Settings,
  LogOut,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Movimientos' },
  { to: '/budgets', icon: Wallet, label: 'Presupuestos' },
  { to: '/settings', icon: Settings, label: 'Ajustes' },
]

export function Layout() {
  const { signOut, user } = useAuth()

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="hidden md:flex md:w-64 flex-col bg-white border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-xl font-semibold text-gray-900">
            Control de Gastos
          </h1>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 truncate mb-2">
            {user?.email}
          </div>
          <button
            onClick={() => void signOut()}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50">
        <div className="flex justify-around">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center py-2 px-3 text-xs ${
                  isActive ? 'text-violet-700' : 'text-gray-500'
                }`
              }
            >
              <Icon className="h-5 w-5 mb-1" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
