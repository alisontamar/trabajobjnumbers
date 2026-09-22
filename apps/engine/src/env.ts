import 'dotenv/config'

function requerido(nombre: string): string {
  const v = process.env[nombre]
  if (!v || !v.trim()) {
    throw new Error(`Falta la variable de entorno ${nombre}`)
  }
  return v.trim()
}

export const env = {
  SUPABASE_URL: requerido('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requerido('SUPABASE_SERVICE_ROLE_KEY'),
  PORT: Number(process.env.PORT ?? 8080),
  HORARIO_TZ_OFFSET: Number(process.env.HORARIO_TZ_OFFSET ?? -4),
  ADMIN_ORIGINS: (process.env.ADMIN_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}
