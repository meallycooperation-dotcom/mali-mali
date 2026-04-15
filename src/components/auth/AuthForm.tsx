import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type AuthFormProps = {
  mode: 'login' | 'signup'
}

export function AuthForm({ mode }: AuthFormProps) {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isSignup = mode === 'signup'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (!supabase) {
      setError('Add your Supabase URL and anon key before using auth.')
      setLoading(false)
      return
    }

    try {
      if (isSignup) {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })

        if (authError) {
          throw authError
        }

        const user = data.user

        if (!user) {
          throw new Error('Supabase did not return a user record.')
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: user.id,
              full_name: fullName.trim(),
              email: email.trim(),
              phone: phone.trim() || null,
              location: location.trim() || null,
              avatar_url: null,
            },
            { onConflict: 'id' },
          )

        if (profileError) {
          throw profileError
        }

        if (data.session) {
          navigate('/profile')
          return
        }

        setSuccess('Check your email to confirm your account.')
        setEmail('')
        setPassword('')
        setFullName('')
        setPhone('')
        setLocation('')
        return
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        throw authError
      }

      navigate('/profile')
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-marketing">
        <p className="eyebrow">Refurbished items in Kenya</p>
        <h1>{isSignup ? 'Start selling with Mali Mali' : 'Welcome back to Mali Mali'}</h1>
        <p>
          Buy and sell refurbished phones, laptops, home appliances, and other
          trusted pre-owned items across Kenya.
        </p>

        <div className="feature-list">
          <div className="feature-card">
            <strong>Trusted marketplace</strong>
            <span>Connect buyers and sellers across Kenya.</span>
          </div>
          <div className="feature-card">
            <strong>Refurbished goods</strong>
            <span>List quality pre-owned items that are ready for a second life.</span>
          </div>
          <div className="feature-card">
            <strong>Simple onboarding</strong>
            <span>Create an account and start managing your shop profile fast.</span>
          </div>
        </div>
      </div>

      <section className="auth-card">
        <div className="auth-card-header">
          <p>{isSignup ? 'Start here' : 'Sign in'}</p>
          <h2>{isSignup ? 'Join Mali Mali' : 'Access your account'}</h2>
          <span>
            {isSignup ? 'Already have an account?' : 'Need an account?'}{' '}
            <Link to={isSignup ? '/login' : '/signup'}>
              {isSignup ? 'Log in' : 'Sign up'}
            </Link>
          </span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup ? (
            <label className="field">
              <span>Full name</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                type="text"
                placeholder="Jane Doe"
                autoComplete="name"
                required
              />
            </label>
          ) : null}

          {isSignup ? (
            <label className="field">
              <span>Phone</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                type="tel"
                placeholder="+254 700 000 000"
                autoComplete="tel"
              />
            </label>
          ) : null}

          {isSignup ? (
            <label className="field">
              <span>Location</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                type="text"
                placeholder="Nairobi"
                autoComplete="address-level2"
              />
            </label>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="jane@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Enter your password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
            />
          </label>

          {error ? <div className="auth-message auth-message-error">{error}</div> : null}
          {success ? (
            <div className="auth-message auth-message-success">{success}</div>
          ) : null}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? 'Working...' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>
      </section>
    </div>
  )
}
