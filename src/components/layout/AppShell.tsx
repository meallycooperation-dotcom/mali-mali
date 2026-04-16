import type { ChangeEvent, FormEvent } from 'react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Search, CircleUserRound, UserRound, MessageCircle, X } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import logo from '../../assets/logo.jpg'

export function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchValue.trim()
    if (query) {
      navigate(`/?q=${encodeURIComponent(query)}`)
      setSearchExpanded(false)
    }
  }

  const handleSearchToggle = () => {
    setSearchExpanded(!searchExpanded)
    if (!searchExpanded) {
      setTimeout(() => document.getElementById('header-search')?.focus(), 100)
    }
  }

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value)
  }

  const handleInputClear = () => {
    setSearchValue('')
    document.getElementById('header-search')?.focus()
  }

  return (
    <div className="app-shell">
      <header className="shell-header">
        <Link to="/" className="brand">
          <img src={logo} alt="Mali Mali" className="brand-logo" />
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
            to="/following"
            className={({ isActive }) =>
              isActive ? 'shell-link shell-link-active' : 'shell-link'
            }
            aria-label="Following"
          >
            <UserRound size={18} />
            <span className="sr-only">Following</span>
          </NavLink>
        </nav>

        <form className={`shell-search ${searchExpanded ? 'shell-search-expanded' : ''}`} onSubmit={handleSearchSubmit} role="search">
          <button 
            type="button" 
            className="shell-search-toggle" 
            onClick={handleSearchToggle}
            aria-label="Search"
          >
            <Search size={18} />
          </button>
          {searchExpanded ? (
            <>
              <input
                id="header-search"
                className="shell-search-input"
                type="search"
                name="q"
                placeholder="Search products"
                value={searchValue}
                onChange={handleSearchChange}
                autoFocus
              />
              {searchValue && (
                <button type="button" className="shell-search-clear" onClick={handleInputClear} aria-label="Clear search">
                  <X size={16} />
                </button>
              )}
            </>
          ) : (
            <input
              id="header-search"
              className="shell-search-input"
              type="search"
              name="q"
              placeholder="Search products"
              value={searchValue}
              onChange={handleSearchChange}
            />
          )}
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
