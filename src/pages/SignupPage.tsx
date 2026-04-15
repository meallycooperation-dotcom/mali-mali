import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AuthForm } from '../components/auth/AuthForm'

export function SignupPage() {
  return (
    <main className="auth-page">
      <div className="auth-page-header">
        <Link to="/" className="back-icon-link" aria-label="Back home">
          <ArrowLeft size={20} />
        </Link>
      </div>
      <AuthForm mode="signup" />
    </main>
  )
}
