-- ============================================================================
-- seed.sql  -  Datos iniciales. Ejecutar UNA vez despues de 0001 y 0002.
-- ============================================================================

-- Sucursales
insert into public.sucursales (nombre) values
  ('Central'),
  ('Santa Cruz'),
  ('Prado')
on conflict (nombre) do nothing;

-- Fila unica de estado de WhatsApp
insert into public.whatsapp_estado (id, estado) values ('default', 'desconectado')
on conflict (id) do nothing;

-- Fila unica de configuracion del motor (valores conservadores para "calentar" el numero)
insert into public.config_envio (id) values ('default')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- CREAR EL PRIMER ADMIN
-- 1) En Supabase: Authentication -> Users -> Add user (email + password).
-- 2) Copiar el UID del usuario y ejecutar (reemplazando los valores):
--
-- insert into public.perfiles (user_id, rol, id_sucursal, nombre)
-- values ('<UID-DEL-USUARIO>', 'admin', null, 'Admin');
--
-- Para un cajero o supervisor, asociar su sucursal:
-- insert into public.perfiles (user_id, rol, id_sucursal, nombre)
-- values ('<UID>', 'cajero',
--         (select id from public.sucursales where nombre = 'Central'),
--         'Nombre Cajero');
-- ----------------------------------------------------------------------------
