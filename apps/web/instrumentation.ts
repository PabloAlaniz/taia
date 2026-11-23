/**
 * Next.js instrumentation — runs once when the server process starts.
 *
 * Registers the TAIA domain event listeners (activity logging, websocket
 * broadcasting, worktree auto-create) so that side effects emitted by the
 * task/dependency services actually fire in the Next.js server process.
 * Without this, `eventBus.emit(...)` from the API routes goes to a bus with
 * no listeners and is silently dropped (e.g. renaming a task never shows up
 * in the Activity feed).
 *
 * It also encrypts the credentials in the settings table when a key is
 * configured (see @taia/core/secret-box), and deletes expired rate limit rows
 * and webhook reservations every hour (see @taia/core/rate-limit and
 * @taia/core/webhook-store).
 */
export async function register() {
  // Only the Node.js server runtime runs the listeners; the Edge runtime has
  // no DB access and never handles these mutations.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initEventListeners } = await import('@taia/core/events')
    initEventListeners()

    // With TAIA_SECRET_KEY set, encrypt credentials saved before it was.
    try {
      const { encryptStoredSecrets } = await import('@taia/core/db/repositories/setting.repository')
      const rewritten = await encryptStoredSecrets()
      if (rewritten > 0) console.log(`[TAIA] Encrypted ${rewritten} stored credential(s)`)
    } catch (error) {
      console.error('[TAIA] Could not encrypt stored credentials:', error)
    }

    const { startRateLimitCleanup } = await import('@taia/core/rate-limit')
    startRateLimitCleanup()

    const { startWebhookEventPurge } = await import('@taia/core/webhook-store')
    startWebhookEventPurge()
  }
}
