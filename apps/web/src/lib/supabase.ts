import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  // eslint-disable-next-line no-console
  console.warn('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env')
}

export const supabase = createClient(url ?? '', key ?? '')
