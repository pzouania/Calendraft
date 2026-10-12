import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables Supabase manquantes. Vérifiez votre fichier .env.local'
  )
}

const RETRY_DELAYS_MS = [1000, 2000, 3500]

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithClockSkewRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let res = await fetch(input, init)
  if (input instanceof Request) return res

  for (const delay of RETRY_DELAYS_MS) {
    if (res.status !== 401) return res
    const body = await res.clone().text().catch(() => '')
    if (!/issued at future/i.test(body)) return res
    await wait(delay)
    res = await fetch(input, init)
  }
  return res
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithClockSkewRetry },
})
