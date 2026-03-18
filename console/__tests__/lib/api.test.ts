import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { lucidGet, lucidPost, ApiError } from '@/lib/api'

describe('lucidApi', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('calls proxy path and returns data on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, stats: { total: 5 } }),
    })

    const result = await lucidGet('/v1/passports/stats')
    expect(mockFetch).toHaveBeenCalledWith('/api/proxy/v1/passports/stats', expect.any(Object))
    expect(result).toEqual({ success: true, stats: { total: 5 } })
  })

  it('throws ApiError on API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'Not found' }),
    })

    await expect(lucidGet('/v1/passports/unknown')).rejects.toThrow('Not found')
    await expect(lucidGet('/v1/passports/unknown').catch(e => e)).resolves.toBeInstanceOf(ApiError)
  })

  it('handles health endpoint without success wrapper', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'healthy', uptime: 1234 }),
    })

    const result = await lucidGet('/health')
    expect(result).toEqual({ status: 'healthy', uptime: 1234 })
  })

  it('sends POST body as JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, id: 'abc' }),
    })

    await lucidPost('/v1/passports', { name: 'test', type: 'model' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/proxy/v1/passports',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test', type: 'model' }),
      })
    )
  })

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    await expect(lucidGet('/v1/broken')).rejects.toThrow('Internal Server Error')
  })
})
