-- ============================================================================
-- schema.sql  -  Esquema completo del CRM de difusion (1 numero WhatsApp POR
-- sucursal). Ejecutar UNA sola vez en Supabase: SQL Editor -> pegar -> Run.
-- Reemplaza a 0001_init.sql + 0002_rls.sql + seed.sql (eliminados).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Sucursales (cada una con su propio numero de WhatsApp)
-- ----------------------------------------------------------------------------
create table if not exists public.sucursales (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null unique,
  whatsapp_numero  text,
  creado_en        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users). Define rol y sucursal del usuario.
-- ----------------------------------------------------------------------------
create table if not exists public.perfiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  rol         text not null check (rol in ('cajero','supervisor','admin')),
  id_sucursal uuid references public.sucursales(id),
  nombre      text,
  creado_en   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Clientes captados en caja
-- ----------------------------------------------------------------------------
create table if not exists public.clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  celular_e164   text not null unique,
  id_sucursal    uuid not null references public.sucursales(id),
  consentimiento boolean not null default true,
  consent_fecha  timestamptz default now(),
  estado         text not null default 'activo' check (estado in ('activo','baja')),
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now()
);
create index if not exists idx_clientes_sucursal on public.clientes(id_sucursal);
create index if not exists idx_clientes_estado   on public.clientes(estado);

-- ----------------------------------------------------------------------------
-- Campanas
-- ----------------------------------------------------------------------------
create table if not exists public.campanas (
  id              uuid primary key default gen_random_uuid(),
  id_sucursal     uuid not null references public.sucursales(id),
  nombre          text not null,
  plantilla_texto text not null,
  segmento        jsonb not null default '{}'::jsonb,
  estado          text not null default 'borrador'
                    check (estado in ('borrador','en_curso','pausada','finalizada')),
  programada_para timestamptz,
  creada_por      uuid references auth.users(id),
  creada_en       timestamptz not null default now()
);
create index if not exists idx_campanas_estado    on public.campanas(estado);
create index if not exists idx_campanas_sucursal  on public.campanas(id_sucursal);

-- ----------------------------------------------------------------------------
-- Destinatarios de campana  ->  ESTA TABLA ES LA COLA DE ENVIO
-- ----------------------------------------------------------------------------
create table if not exists public.campana_destinatarios (
  id               uuid primary key default gen_random_uuid(),
  id_campana       uuid not null references public.campanas(id) on delete cascade,
  id_cliente       uuid not null references public.clientes(id),
  celular_snapshot text not null,
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente','enviado','fallido','sin_whatsapp','omitido')),
  intento          int not null default 0,
  error            text,
  enviado_en       timestamptz,
  creado_en        timestamptz not null default now(),
  unique (id_campana, id_cliente)
);
create index if not exists idx_dest_estado  on public.campana_destinatarios(estado);
create index if not exists idx_dest_campana on public.campana_destinatarios(id_campana);

-- ----------------------------------------------------------------------------
-- Estado de la sesion de WhatsApp: 1 fila POR sucursal
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_estado (
  id_sucursal    uuid primary key references public.sucursales(id) on delete cascade,
  estado         text not null default 'desconectado'
                   check (estado in ('desconectado','esperando_qr','conectando','conectado')),
  qr             text,
  numero         text,
  actualizado_en timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Credenciales de Baileys, una por sucursal (clave/valor). Solo el engine
-- (service_role) accede.
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_auth (
  id_sucursal    uuid not null references public.sucursales(id) on delete cascade,
  key            text not null,
  value          jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (id_sucursal, key)
);

-- ----------------------------------------------------------------------------
-- Configuracion del motor de envio: 1 fila POR sucursal (cada numero calienta
-- y respeta su propio tope diario / ventana horaria)
-- ----------------------------------------------------------------------------
create table if not exists public.config_envio (
  id_sucursal     uuid primary key references public.sucursales(id) on delete cascade,
  tope_diario     int not null default 30,
  delay_min_seg   int not null default 45,
  delay_max_seg   int not null default 90,
  hora_inicio     int not null default 9,
  hora_fin        int not null default 20,
  pausa_cada      int not null default 20,
  pausa_larga_seg int not null default 600,
  contador_fecha  date,
  contador_hoy    int not null default 0,
  activo          boolean not null default true,
  actualizado_en  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Opt-outs (bajas por "STOP" / "BAJA" u otra via)
-- ----------------------------------------------------------------------------
create table if not exists public.opt_outs (
  celular_e164 text primary key,
  motivo       text,
  creado_en    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Auditoria de acciones sensibles
-- ----------------------------------------------------------------------------
create table if not exists public.auditoria (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid,
  accion    text not null,
  detalle   jsonb,
  creado_en timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helpers para las politicas RLS (SECURITY DEFINER -> no recursan sobre RLS)
-- ----------------------------------------------------------------------------
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where user_id = auth.uid()
$$;

create or replace function public.sucursal_actual()
returns uuid language sql stable security definer set search_path = public as $$
  select id_sucursal from public.perfiles where user_id = auth.uid()
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'admin' from public.perfiles where user_id = auth.uid()), false)
$$;

-- ============================================================================
-- Row Level Security
--
-- Reglas:
--   cajero      -> solo INSERT de clientes en SU sucursal; ve su sucursal
--   supervisor  -> lo de cajero + gestiona campanas de SU sucursal + ve el
--                  WhatsApp/config de SU sucursal (solo lectura)
--   admin       -> control total + WhatsApp + config de todas las sucursales
--   engine      -> usa service_role, IGNORA RLS (no necesita politicas)
-- ============================================================================

alter table public.sucursales            enable row level security;
alter table public.perfiles              enable row level security;
alter table public.clientes              enable row level security;
alter table public.campanas              enable row level security;
alter table public.campana_destinatarios enable row level security;
alter table public.whatsapp_estado       enable row level security;
alter table public.whatsapp_auth         enable row level security;
alter table public.config_envio          enable row level security;
alter table public.opt_outs              enable row level security;
alter table public.auditoria             enable row level security;

-- ---------------------------------------------------------------- sucursales
drop policy if exists sucursales_select on public.sucursales;
create policy sucursales_select on public.sucursales
  for select to authenticated using (true);

drop policy if exists sucursales_admin on public.sucursales;
create policy sucursales_admin on public.sucursales
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------- perfiles
drop policy if exists perfiles_select on public.perfiles;
create policy perfiles_select on public.perfiles
  for select to authenticated
  using (user_id = auth.uid() or public.es_admin());

drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_admin on public.perfiles
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------- clientes
drop policy if exists clientes_select on public.clientes;
create policy clientes_select on public.clientes
  for select to authenticated
  using (public.es_admin() or id_sucursal = public.sucursal_actual());

drop policy if exists clientes_insert on public.clientes;
create policy clientes_insert on public.clientes
  for insert to authenticated
  with check (
    public.es_admin()
    or (
      public.rol_actual() in ('cajero','supervisor')
      and id_sucursal = public.sucursal_actual()
      and creado_por = auth.uid()
    )
  );

drop policy if exists clientes_update on public.clientes;
create policy clientes_update on public.clientes
  for update to authenticated
  using (public.es_admin() or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual()))
  with check (public.es_admin() or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual()));

drop policy if exists clientes_delete on public.clientes;
create policy clientes_delete on public.clientes
  for delete to authenticated using (public.es_admin());

-- ---------------------------------------------------------------- campanas
drop policy if exists campanas_select on public.campanas;
create policy campanas_select on public.campanas
  for select to authenticated
  using (public.es_admin() or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual()));

drop policy if exists campanas_insert on public.campanas;
create policy campanas_insert on public.campanas
  for insert to authenticated
  with check (
    public.es_admin()
    or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual() and creada_por = auth.uid())
  );

drop policy if exists campanas_update on public.campanas;
create policy campanas_update on public.campanas
  for update to authenticated
  using (public.es_admin() or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual()))
  with check (public.es_admin() or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual()));

drop policy if exists campanas_delete on public.campanas;
create policy campanas_delete on public.campanas
  for delete to authenticated using (public.es_admin());

-- --------------------------------------------------- campana_destinatarios
-- Lectura para seguimiento. La escritura la hace el engine (service_role).
drop policy if exists dest_select on public.campana_destinatarios;
create policy dest_select on public.campana_destinatarios
  for select to authenticated
  using (
    public.es_admin()
    or exists (
      select 1 from public.campanas c
      where c.id = campana_destinatarios.id_campana
        and public.rol_actual() = 'supervisor'
        and c.id_sucursal = public.sucursal_actual()
    )
  );

-- ---------------------------------------------------------------- whatsapp_estado
drop policy if exists wa_estado_select on public.whatsapp_estado;
create policy wa_estado_select on public.whatsapp_estado
  for select to authenticated
  using (
    public.es_admin()
    or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual())
  );

-- ---------------------------------------------------------------- whatsapp_auth
-- Sin politicas: nadie via API publica. Solo service_role (engine).

-- ---------------------------------------------------------------- config_envio
drop policy if exists config_select on public.config_envio;
create policy config_select on public.config_envio
  for select to authenticated
  using (
    public.es_admin()
    or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual())
  );

drop policy if exists config_update on public.config_envio;
create policy config_update on public.config_envio
  for update to authenticated
  using (public.es_admin() or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual()))
  with check (public.es_admin() or (public.rol_actual() = 'supervisor' and id_sucursal = public.sucursal_actual()));

-- ---------------------------------------------------------------- opt_outs
drop policy if exists optouts_select on public.opt_outs;
create policy optouts_select on public.opt_outs
  for select to authenticated using (public.es_admin());

-- ---------------------------------------------------------------- auditoria
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria
  for select to authenticated using (public.es_admin());

drop policy if exists auditoria_insert on public.auditoria;
create policy auditoria_insert on public.auditoria
  for insert to authenticated with check (user_id = auth.uid());

-- ============================================================================
-- Datos iniciales
-- ============================================================================

insert into public.sucursales (nombre, whatsapp_numero) values
  ('Central',    '+59157716465'),
  ('Santa Cruz', '+59171694354'),
  ('Prado',      '+59162573072')
on conflict (nombre) do update set whatsapp_numero = excluded.whatsapp_numero;

-- Una fila de whatsapp_estado y config_envio POR sucursal.
insert into public.whatsapp_estado (id_sucursal, estado)
  select id, 'desconectado' from public.sucursales
on conflict (id_sucursal) do nothing;

insert into public.config_envio (id_sucursal)
  select id from public.sucursales
on conflict (id_sucursal) do nothing;

-- ----------------------------------------------------------------------------
-- CREAR EL PRIMER ADMIN (ejecutar despues de lo anterior)
-- 1) En Supabase: Authentication -> Users -> Add user (email + password).
-- 2) Copiar el UID del usuario y ejecutar (reemplazando el valor):
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
