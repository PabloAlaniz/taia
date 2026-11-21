'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Alert, Button, Input, Label } from '@/components/atoms'

/** Only same-site paths: `next` comes from the URL. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

function LoginForm() {
  const t = useTranslations('login')
  const next = safeNext(useSearchParams().get('next'))
  const [token, setToken] = useState('')
  const [error, setError] = useState<'invalid' | 'throttled' | 'failed' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        // A full navigation, so every request from here on carries the cookie.
        window.location.assign(next)
        return
      }
      setError(res.status === 401 ? 'invalid' : res.status === 429 ? 'throttled' : 'failed')
    } catch {
      setError('failed')
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4">
      <div className="text-center space-y-2">
        <div className="text-4xl" aria-hidden="true">
          🧉
        </div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('description')}</p>
      </div>

      <div>
        <Label htmlFor="access-token">{t('tokenLabel')}</Label>
        <Input
          id="access-token"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>

      {error && <Alert variant="error">{t(error)}</Alert>}

      <Button type="submit" variant="primary" size="md" disabled={submitting} className="w-full">
        {submitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-background flex items-center justify-center p-6"
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
