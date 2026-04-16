import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, Search, CircleUserRound, UserRound, MessageCircle, X, Users } from 'lucide-react'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabase'
import logo from '../../assets/logo.jpg'

export function AppShell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const client = supabase

    if (!client || !user) {
      return
    }

    let isMounted = true

    const loadUnreadCount = async () => {
      if (!isMounted) return

      const { data: participantData } = await client
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)

      if (!isMounted) return

      const conversationIds = Array.from(
        new Set(((participantData ?? []) as { conversation_id: string }[]).map((row) => row.conversation_id)),
      )

      if (conversationIds.length === 0) {
        setUnreadCount(0)
        return
      }

      const { data: messageData } = await client
        .from('messages')
        .select('id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', user.id)
        .eq('is_read', false)

      if (isMounted) {
        setUnreadCount((messageData ?? []).length)
      }
    }

    loadUnreadCount()

    const interval = setInterval(loadUnreadCount, 30000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [user])

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
    const value = event.target.value
    setSearchValue(value)

    // Real-time filtering: update query param as user types
    const q = value.trim()
    if (q) {
      navigate(`/?q=${encodeURIComponent(q)}`)
    } else {
      navigate('/')
    }
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
                placeholder="search products and users"
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
              placeholder="search products and users"
              value={searchValue}
              onChange={handleSearchChange}
            />
          )}
        </form>

        <div className="shell-actions">
          {user ? (
            <>
              <Link className="ghost-button" to="/users" aria-label="Users">
                <Users size={18} />
                <span className="sr-only">Users</span>
              </Link>
              <Link className="ghost-button shell-message-button" to="/inbox" aria-label="Messages">
                <MessageCircle size={18} />
                {unreadCount > 0 && (
                  <span className="inbox-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
                <span className="sr-only">Messages</span>
              </Link>
              <Link className="ghost-button shell-profile-button" to="/profile" aria-label="Profile">
                <CircleUserRound size={18} />
                <span>Profile</span>
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
