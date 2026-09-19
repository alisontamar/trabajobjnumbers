import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Cliente con service_role: IGNORA las politicas RLS.
// Solo debe existir en el backend, nunca exponerlo al navegador.
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
