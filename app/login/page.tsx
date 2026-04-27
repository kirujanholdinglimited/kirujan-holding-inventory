'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    setMessage('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Login successful. Redirecting to dashboard...')
    setLoading(false)
    router.push('/dashboard')
  }

  async function handleForgotPassword() {
    setMessage('')

    if (!email) {
      setMessage('Enter your email first, then click Forgot password.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:3000/reset-password',
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Password reset email sent. Check your inbox.')
    setLoading(false)
  }

  async function handleCreateAccount() {
    setMessage('')

    if (!email || !password) {
      setMessage('Enter an email and password first, then click Create an account.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage('Account created. Check your email if confirmation is required.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-6 text-center text-black">
          Login
        </h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-4 py-2 border border-gray-400 text-black placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-2 px-4 py-2 border border-gray-400 text-black placeholder-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
        />

        <div className="text-right mb-4">
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loading}
            className="text-sm text-black hover:underline disabled:opacity-50"
          >
            Forgot password?
          </button>
        </div>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded-lg hover:opacity-90 mb-4 disabled:opacity-50"
        >
          {loading ? 'Please wait...' : 'Sign In'}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleCreateAccount}
            disabled={loading}
            className="text-sm text-black hover:underline disabled:opacity-50"
          >
            Create an account
          </button>
        </div>

        {message && (
          <p className="mt-4 text-sm text-center text-black">
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
