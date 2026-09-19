-- ============================================================================
-- 0001_init.sql  -  Esquema base del CRM de difusion
-- Ejecutar en Supabase: SQL Editor -> pegar -> Run
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Sucursales
-- ----------------------------------------------------------------------------
create table if not exists public.sucursales (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  creado_en  timestamptz not null default now()
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
create index if not exists idx_campanas_estado on public.campanas(estado);

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
-- Estado de la sesion de WhatsApp (una sola fila, id = 'default')
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_estado (
  id             text primary key default 'default',
  estado         text not null default 'desconectado'
                   check (estado in ('desconectado','esperando_qr','conectando','conectado')),
  qr             text,
  numero         text,
  actualizado_en timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Credenciales de Baileys (clave/valor). SOLO el engine (service_role) accede.
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_auth (
  key            text primary key,
  value          jsonb not null,
  actualizado_en timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Configuracion del motor de envio (una sola fila, id = 'default')
-- ----------------------------------------------------------------------------
create table if not exists public.config_envio (
  id              text primary key default 'default',
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
