// Webhook secrets for tests, built at run time.
//
// A literal `whsec_<base64>` in the source looks like a real signing secret to
// secret scanners, so tests never commit one: each call returns a fresh random
// secret in the Standard Webhooks format. Nothing may depend on its value.

import { randomBytes } from 'node:crypto'

/** A fresh `whsec_<base64>` secret, valid for Standard Webhooks. */
export function testWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64')}`
}
