import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'

type ProfileRecord = {
  id: string
  full_name: string
  avatar_url: string | null
  location: string | null
  created_at: string | null
}

export function UsersPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  // local toggle for showing the search input
  const [showSearch, setShowSearch] = useState(false)
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const client = supabase

    if (!client || !user) {
      setLoading(false)
      return
    }

    let isMounted = true

    const loadProfiles = async () => {
      setLoading(true)
      setError('')

      const { data: profileData, error: profileError } = await client
        .from('profiles')
        .select('id, full_name, avatar_url, location, created_at')
        .neq('id', user.id)
        .order('full_name', { ascending: true })

      if (!isMounted) {
        return
      }

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }

      setProfiles((profileData ?? []) as ProfileRecord[])

      const { data: followingData } = await client
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      if (isMounted && followingData) {
        setFollowingIds(new Set((followingData as { following_id: string }[]).map(f => f.following_id)))
      }

      setLoading(false)
    }

    loadProfiles()

    return () => {
      isMounted = false
    }
  }, [user])

  const handleFollow = async (e: React.MouseEvent, targetUserId: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user || !supabase) return

    const isFollowing = followingIds.has(targetUserId)

    if (isFollowing) {
      await supabase.from('follows').delete()
        .match({ follower_id: user.id, following_id: targetUserId })
      setFollowingIds(prev => {
        const next = new Set(prev)
        next.delete(targetUserId)
        return next
      })
    } else {
      await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: targetUserId,
      })
      setFollowingIds(prev => new Set(prev).add(targetUserId))
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // derived filtered query in lowercase for matching
  const queryLower = query.toLowerCase()
  const filteredProfiles = profiles.filter((p) => {
    if (!queryLower) return true
    return p.full_name.toLowerCase().includes(queryLower)
  })

  return (
    <section className="page page-users">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1>Users</h1>
          <p>Discover and follow other users</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showSearch && (
            <input
              type="text"
              value={query}
              onChange={(e) => setSearchParams({ q: e.target.value })}
              placeholder="Search users..."
              aria-label="Search users"
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc' }}
            />
          )}
          <button
            type="button"
            onClick={() => setShowSearch((s) => !s)}
            aria-label="Toggle search"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <Search size={18} />
          </button>
        </div>
      </div>

      {loading ? <p className="market-status">Loading users...</p> : null}
      {error ? <p className="market-status market-status-error">{error}</p> : null}

      {!loading && !error ? (
        filteredProfiles.length === 0 ? (
          <div className="market-empty">
            {query ? (
              <>
                <h2>No users found</h2>
                <p>No users match "{query}".</p>
              </>
            ) : (
              <>
                <h2>No users found</h2>
                <p>Be the first to join!</p>
              </>
            )}
          </div>
        ) : (
          <div className="users-grid">
            {filteredProfiles.map((profile) => (
                  <Link
                    key={profile.id}
                    to={`/profile/${profile.id}`}
                    className="user-card"
                  >
                <div className="user-avatar">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.full_name} />
                  ) : (
                    <span>{getInitials(profile.full_name)}</span>
                  )}
                </div>
                <div className="user-info">
                  <strong>{profile.full_name}</strong>
                  {profile.location ? <small>{profile.location}</small> : null}
                </div>
                <div className="user-action">
                  <button
                    type="button"
                    className={followingIds.has(profile.id) ? 'ghost-button' : 'primary-button'}
                    onClick={(e) => handleFollow(e, profile.id)}
                  >
                    {followingIds.has(profile.id) ? 'Following' : 'Follow'}
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : null}
    </section>
  )
}
