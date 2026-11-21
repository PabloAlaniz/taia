import { afterEach, describe, expect, it } from 'vitest'
import {
  assertPublicWebhookUrl,
  isNonPublicAddress,
  OutboundUrlError,
} from '@taia/core/outbound-url-policy'

const resolvesTo =
  (...addresses: string[]) =>
  async () =>
    addresses

afterEach(() => {
  delete process.env.TAIA_WEBHOOK_ALLOW_PRIVATE
})

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '127.8.8.8',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '::1',
    '::',
    'fd00:ec2::254',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('treats %s as non-public', (address) => {
    expect(isNonPublicAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'treats %s as public',
    (address) => {
      expect(isNonPublicAddress(address)).toBe(false)
    },
  )
})

describe('assertPublicWebhookUrl', () => {
  it('accepts a host that resolves to public addresses', async () => {
    await expect(
      assertPublicWebhookUrl('https://hooks.example.com/x', resolvesTo('93.184.216.34')),
    ).resolves.toBeUndefined()
  })

  it.each([
    'http://127.0.0.1:5432/',
    'http://localhost:13333/api/settings',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]:8080/',
    'http://192.168.0.1/admin',
  ])('refuses %s', async (url) => {
    await expect(assertPublicWebhookUrl(url, resolvesTo('127.0.0.1'))).rejects.toThrow(
      OutboundUrlError,
    )
  })

  it('refuses a name that resolves to both a public and a private address', async () => {
    await expect(
      assertPublicWebhookUrl(
        'https://rebind.example.com/',
        resolvesTo('93.184.216.34', '10.0.0.5'),
      ),
    ).rejects.toThrow(/not a public address/)
  })

  it('refuses a name that does not resolve', async () => {
    await expect(
      assertPublicWebhookUrl('https://nope.invalid/', async () => {
        throw new Error('ENOTFOUND')
      }),
    ).rejects.toThrow(/could not be resolved/)
  })

  it.each(['ftp://example.com/', 'file:///etc/passwd', 'not a url'])(
    'refuses %s whatever the setting',
    async (url) => {
      process.env.TAIA_WEBHOOK_ALLOW_PRIVATE = '1'
      await expect(assertPublicWebhookUrl(url)).rejects.toThrow(OutboundUrlError)
    },
  )

  it('accepts private receivers with TAIA_WEBHOOK_ALLOW_PRIVATE=1', async () => {
    process.env.TAIA_WEBHOOK_ALLOW_PRIVATE = '1'
    await expect(assertPublicWebhookUrl('http://localhost:5678/webhook')).resolves.toBeUndefined()
  })
})
