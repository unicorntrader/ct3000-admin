import { createClient } from '@supabase/supabase-js'

// Admin panel uses the service role key to bypass RLS and access auth.users
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars not set. REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_SERVICE_KEY required.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
