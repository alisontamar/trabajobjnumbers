# Supabase

Ejecutar **una sola vez** en el **SQL Editor** del proyecto:

1. `schema.sql` — tablas, indices, funciones helper, RLS y datos iniciales
   (sucursales Central / Santa Cruz / Prado, cada una con su numero de
   WhatsApp, mas las filas de `whatsapp_estado` y `config_envio` por sucursal).

Luego crear el primer usuario en **Authentication → Users** e insertar su fila en
`public.perfiles` con `rol = 'admin'` (ver comentario al final de `schema.sql`).

## Arquitectura: 1 numero de WhatsApp por sucursal

Cada sucursal tiene su propia sesion de Baileys, su propio QR y su propio
tope diario / ventana horaria. El engine levanta una conexion y un worker de
cola por cada fila de `sucursales`.

## Tablas

| Tabla | Quien escribe | Notas |
|---|---|---|
| `sucursales` | admin | catalogo + `whatsapp_numero` de referencia |
| `perfiles` | admin | rol + sucursal por usuario (1:1 con `auth.users`) |
| `clientes` | cajero/supervisor (su sucursal), admin | `celular_e164` unico |
| `campanas` | supervisor (su sucursal), admin | `segmento` jsonb |
| `campana_destinatarios` | **engine** (service_role) | la cola de envio |
| `whatsapp_estado` | engine | 1 fila por `id_sucursal`, expone el QR |
| `whatsapp_auth` | engine | credenciales Baileys por sucursal, sin acceso via API publica |
| `config_envio` | admin | 1 fila por `id_sucursal`: tope diario, delays, ventana horaria |
| `opt_outs` | engine | bajas |
| `auditoria` | engine + web | acciones sensibles |

## Regenerar tipos (opcional)

Si cambias el esquema y quieres tipos exactos:
```bash
npx supabase gen types typescript --project-id <ref> > packages/shared/src/database.types.ts
```
(No es obligatorio: `packages/shared/src/types.ts` ya define los tipos a mano.)
