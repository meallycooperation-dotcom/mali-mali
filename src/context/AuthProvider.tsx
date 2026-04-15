import { useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthContext } from './authContext'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(supabase))

  useEffect(() => {
    const client = supabase

    if (!client) {
      return
    }

    let isMounted = true

    const loadSession = async () => {
      const { data, error } = await client.auth.getSession()

      if (!isMounted) {
        return
      }

      if (error) {
        console.error('Failed to load session:', error)
      }

      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    }

    loadSession()

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return
      }

      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    if (!supabase) {
      return
    }

    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isConfigured: isSupabaseConfigured,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
