import { createClient } from '@supabase/supabase-js'

// Browser-side Supabase client. Uses the PUBLISHABLE key (RLS-respecting).
// Privileged operations are NOT done from the browser — they go through
// /api/* serverless routes that hold SUPABASE_SECRET_KEY server-side.
//
// This file used to also export a `supabaseAdmin` client built with the
// service-role key. That key was reachable from any browser that loaded the
// JS bundle (CRA inlines REACT_APP_* vars at build time), giving full RLS
// bypass to anyone who could fetch main.js. The fix is architectural: keep
// the key server-side and route all privileged ops through /api.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars not set. REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY required.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
