import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
} from 'baileys'
import { supabase } from '../supabase'
import { logger } from '../logger'

const TABLE = 'whatsapp_auth'

/**
 * Estado de autenticacion de Baileys persistido en la tabla whatsapp_auth
 * de Supabase (clave/valor). Equivale a useMultiFileAuthState pero contra
 * Postgres, para que la sesion sobreviva a los redeploy del engine.
 */
export async function useSupabaseAuthState(sessionId: string): Promise<{
  state: AuthenticationState
  saveCreds: () => Promise<void>
}> {
  const prefix = `${sessionId}:`

  async function read(key: string): Promise<any | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('value')
      .eq('key', prefix + key)
      .maybeSingle()
    if (error) {
      logger.error({ err: error, key }, 'authState.read')
      return null
    }
    if (!data) return null
    return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver)
  }

  async function write(key: string, value: unknown): Promise<void> {
    const payload = JSON.parse(JSON.stringify(value, BufferJSON.replacer))
    const { error } = await supabase.from(TABLE).upsert({
      key: prefix + key,
      value: payload,
      actualizado_en: new Date().toISOString(),
    })
    if (error) logger.error({ err: error, key }, 'authState.write')
  }

  async function remove(key: string): Promise<void> {
    const { error } = await supabase.from(TABLE).delete().eq('key', prefix + key)
    if (error) logger.error({ err: error, key }, 'authState.remove')
  }

  const creds: AuthenticationCreds = (await read('creds')) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result: Record<string, any> = {}
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`)
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value)
              }
              result[id] = value
            }),
          )
          return result
        },
        set: async (data) => {
          const tasks: Promise<void>[] = []
          for (const category in data) {
            const cat = (data as any)[category]
            for (const id in cat) {
              const value = cat[id]
              const key = `${category}-${id}`
              tasks.push(value ? write(key, value) : remove(key))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: async () => {
      await write('creds', creds)
    },
  }
}

/** Borra todas las credenciales de una sesion (equivale a "cerrar sesion"). */
export async function limpiarAuth(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .like('key', `${sessionId}:%`)
  if (error) logger.error({ err: error }, 'limpiarAuth')
}
