import { describe, it, expect } from 'vitest'
import { AppError, NotFoundError, ValidationError, apiOk, apiError } from '@taia/core/errors'

describe('AppError', () => {
  it('creates error with default status 500', () => {
    const err = new AppError('Something broke')
    expect(err.message).toBe('Something broke')
    expect(err.statusCode).toBe(500)
    expect(err.code).toBeUndefined()
    expect(err.name).toBe('AppError')
  })

  it('creates error with custom status and code', () => {
    const err = new AppError('Forbidden', 403, 'FORBIDDEN')
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
  })

  it('is instanceof Error', () => {
    const err = new AppError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })
})

describe('NotFoundError', () => {
  it('creates 404 error with resource name', () => {
    const err = new NotFoundError('Task')
    expect(err.message).toBe('Task not found')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
  })

  it('includes id in message when provided', () => {
    const err = new NotFoundError('Task', 'task-123')
    expect(err.message).toBe("Task 'task-123' not found")
  })

  it('is instanceof AppError', () => {
    const err = new NotFoundError('Agent')
    expect(err).toBeInstanceOf(AppError)
  })
})

describe('ValidationError', () => {
  it('creates 400 error', () => {
    const err = new ValidationError('Invalid input')
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
  })

  it('includes details when provided', () => {
    const details = { title: ['Title is required'] }
    const err = new ValidationError('Validation failed', details)
    expect(err.details).toEqual(details)
  })

  it('is instanceof AppError', () => {
    const err = new ValidationError('bad')
    expect(err).toBeInstanceOf(AppError)
  })
})

describe('apiOk', () => {
  it('returns JSON with ok: true', async () => {
    const res = apiOk({ task: { id: '1' } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.task).toEqual({ id: '1' })
  })

  it('supports custom status code', async () => {
    const res = apiOk({ created: true }, 201)
    expect(res.status).toBe(201)
  })
})

describe('apiError', () => {
  it('handles AppError', async () => {
    const err = new AppError('Server error', 500, 'INTERNAL')
    const res = apiError(err)
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Server error')
    expect(data.code).toBe('INTERNAL')
  })

  it('handles NotFoundError', async () => {
    const err = new NotFoundError('Task', 'abc')
    const res = apiError(err)
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toContain('not found')
  })

  it('handles ValidationError with details', async () => {
    const err = new ValidationError('Bad input', { name: ['required'] })
    const res = apiError(err)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.details).toEqual({ name: ['required'] })
  })

  it('handles generic Error with fallback status', async () => {
    const err = new Error('Unexpected')
    const res = apiError(err)
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe('Unexpected')
  })

  it('handles non-Error with fallback message', async () => {
    const res = apiError('string error')
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe('Internal server error')
  })
})
