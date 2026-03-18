export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function lucidApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new ApiError(text, res.status)
  }

  const json = await res.json()

  // /health returns { status, ... } directly (no success wrapper)
  if ('success' in json && !json.success) {
    throw new ApiError(json.error || `API error: ${res.status}`, res.status)
  }

  return json as T
}

export const lucidGet = <T>(path: string) => lucidApi<T>(path)

export const lucidPost = <T>(path: string, body: unknown) =>
  lucidApi<T>(path, { method: 'POST', body: JSON.stringify(body) })
