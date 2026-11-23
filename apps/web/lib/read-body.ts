/** A request body over the byte limit; routes answer it with 413. */
export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body is larger than ${maxBytes} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

/**
 * The body as text, refusing it as soon as it passes `maxBytes`: by its
 * Content-Length when it declares one, else while it streams in, so an
 * oversized body is never held in memory whole.
 */
export async function readTextWithin(request: Request, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readBytesWithin(request, maxBytes))
}

/**
 * The body exactly as it arrived, with the same limit as `readTextWithin`.
 * Signatures are computed over these bytes, so a webhook must be verified on
 * them and not on a decoded copy.
 */
export async function readBytesWithin(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes)
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new BodyTooLargeError(maxBytes)
    }
    chunks.push(value)
  }
  return new Uint8Array(Buffer.concat(chunks))
}
