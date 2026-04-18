import { supabase } from './supabaseClient'

// Wrapper around fetch() that attaches the admin's Supabase access token as
// a Bearer header. Every /api/* route runs verifyAdmin against this token
// before doing anything privileged.
export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${session?.access_token || ''}`,
  }

  let body = options.body
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }

  const res = await fetch(path, { ...options, headers, body })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const errBody = await res.json()
      if (errBody?.error) msg = errBody.error
    } catch {}
    throw new Error(msg)
  }
  return res.json()
}
