# Supabase

Ejecutar en orden desde el **SQL Editor** del proyecto:

1. `migrations/0001_init.sql` — tablas, indices y funciones helper de RLS.
2. `migrations/0002_rls.sql` — habilita RLS y crea las politicas.
3. `seed.sql` — sucursales (Central, Santa Cruz, Prado) + filas unicas de
   `whatsapp_estado` y `config_envio`.

Luego crear el primer usuario en **Authentication → Users** e insertar su fila en
`public.perfiles` con `rol = 'admin'` (ver comentario al final de `seed.sql`).

## Tablas

| Tabla | Quien escribe | Notas |
|---|---|---|
| `sucursales` | admin | catalogo |
| `perfiles` | admin | rol + sucursal por usuario (1:1 con `auth.users`) |
| `clientes` | cajero/supervisor (su sucursal), admin | `celular_e164` unico |
| `campanas` | supervisor (su sucursal), admin | `segmento` jsonb |
| `campana_destinatarios` | **engine** (service_role) | la cola de envio |
| `whatsapp_estado` | engine | 1 fila `id='default'`, expone el QR |
| `whatsapp_auth` | engine | credenciales Baileys, sin acceso via API publica |
| `config_envio` | admin | tope diario, delays, ventana horaria |
| `opt_outs` | engine | bajas |
| `auditoria` | engine + web | acciones sensibles |

## Regenerar tipos (opcional)

Si cambias el esquema y quieres tipos exactos:
```bash
npx supabase gen types typescript --project-id <ref> > packages/shared/src/database.types.ts
```
(No es obligatorio: `packages/shared/src/types.ts` ya define los tipos a mano.)
