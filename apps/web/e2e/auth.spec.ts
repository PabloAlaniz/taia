import { expect, test } from '@playwright/test'
import { E2E_API_TOKEN, E2E_AUTH_URL } from '../playwright.config'

// The instance at E2E_AUTH_URL runs with TAIA_API_TOKEN set.

test.use({ baseURL: E2E_AUTH_URL })

test('a protected instance asks for the access token', async ({ page, request }) => {
  await test.step('the API refuses calls without the token', async () => {
    expect((await request.get('/api/tasks')).status()).toBe(401)
    expect((await request.get('/api/settings?reveal=anything')).status()).toBe(401)
    expect(
      (
        await request.get('/api/tasks', { headers: { Authorization: 'Bearer wrong-token-wrong' } })
      ).status(),
    ).toBe(401)
  })

  await test.step('and serves them with it', async () => {
    const res = await request.get('/api/tasks', {
      headers: { Authorization: `Bearer ${E2E_API_TOKEN}` },
    })
    expect(res.status()).toBe(200)
    expect((await request.get('/api/health')).status()).toBe(200)
  })

  await test.step('a browser is sent to the login screen', async () => {
    await page.goto('/settings')

    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/)
    await expect(page.getByRole('heading', { name: 'Ingresá a TAIA' })).toBeVisible()
  })

  await test.step('a wrong token is refused', async () => {
    await page.getByLabel('Token de acceso').fill('not-the-token')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByText('El token no es correcto.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  await test.step('the right token opens the page that was asked for', async () => {
    await page.getByLabel('Token de acceso').fill(E2E_API_TOKEN)
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page).toHaveURL(/\/settings$/)
    // The session cookie now authorizes API calls from the page.
    expect((await page.request.get('/api/tasks')).status()).toBe(200)
  })

  await test.step('the WebSocket only accepts the ticket of a session', async () => {
    const { wsUrl } = await (await page.request.get('/api/config/client')).json()
    expect(wsUrl).toContain('ticket=')

    // Opened from the page, as the board does.
    const connect = (url: string) =>
      page.evaluate(
        (target) =>
          new Promise<string>((resolve) => {
            const socket = new WebSocket(target)
            socket.onopen = () => {
              socket.close()
              resolve('open')
            }
            socket.onerror = () => resolve('refused')
          }),
        url,
      )

    expect(await connect(wsUrl)).toBe('open')
    expect(await connect(wsUrl.split('?')[0])).toBe('refused')
  })

  await test.step('logging out ends the session', async () => {
    expect((await page.request.post('/api/auth/logout')).status()).toBe(200)
    expect((await page.request.get('/api/tasks')).status()).toBe(401)
  })
})
