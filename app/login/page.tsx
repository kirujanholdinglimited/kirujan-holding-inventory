'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignIn = async () => {
    setMessage('')

    if (!email.trim() || !password.trim()) {
      setMessage('Please enter your email and password.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Login successful. No redirect yet.')
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
          <button className="text-sm text-black hover:underline">
            Forgot password?
          </button>
        </div>

        {message && (
          <div className="mb-4 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-black">
            {message}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded-lg hover:opacity-90 mb-4 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="text-center">
          <button className="text-sm text-black hover:underline">
            Create an account
          </button>
        </div>
      </div>
    </div>
  )
}
