import type { ChangeEvent, FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Search, CircleUserRound, UserRound, MessageCircle } from 'lucide-react'
import { useAuth } from '../../context/useAuth'

export function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const rawQuery = String(formData.get('q') ?? '')
    const query = rawQuery.trim()
    navigate(query ? `/?q=${encodeURIComponent(rawQuery)}` : '/')
  }

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawQuery = event.target.value
    const query = rawQuery.trim()
    navigate(query ? `/?q=${encodeURIComponent(rawQuery)}` : '/', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="shell-header">
        <Link to="/" className="brand">
          <span className="brand-mark">MM</span>
          <span className="brand-copy">
            <strong>Mali Mali</strong>
            <small>Refurbished marketplace</small>
          </span>
        </Link>

        <nav className="shell-nav" aria-label="Primary">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? 'shell-link shell-link-active' : 'shell-link'
            }
            end
            aria-label="Home"
          >
            <Home size={18} />
            <span className="sr-only">Home</span>
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              isActive ? 'shell-link shell-link-active' : 'shell-link'
            }
            aria-label="Profile"
          >
            <UserRound size={18} />
            <span className="sr-only">Profile</span>
          </NavLink>
        </nav>

        <form className="shell-search" onSubmit={handleSearch} role="search">
          <label className="sr-only" htmlFor="header-search">
            Search products
          </label>
          <input
            id="header-search"
            className="shell-search-input"
            type="search"
            name="q"
            placeholder="Search products"
            defaultValue={new URLSearchParams(location.search).get('q') ?? ''}
            onChange={handleSearchChange}
          />
          <button className="shell-search-button" type="submit" aria-label="Search">
            <Search size={18} />
          </button>
        </form>

        <div className="shell-actions">
          {user ? (
            <>
              <Link className="ghost-button shell-profile-button" to="/profile" aria-label="Profile">
                <CircleUserRound size={18} />
                <span>Profile</span>
              </Link>
              <Link className="ghost-button shell-message-button" to="/inbox" aria-label="Messages">
                <MessageCircle size={18} />
                <span className="sr-only">Messages</span>
              </Link>
            </>
          ) : (
            <>
              <Link className="ghost-button" to="/login">
                Log in
              </Link>
              <Link className="primary-button" to="/signup">
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  )
}
