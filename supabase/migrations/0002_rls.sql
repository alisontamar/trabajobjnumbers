-- ============================================================================
-- 0002_rls.sql  -  Row Level Security
--
-- Reglas:
--   cajero      -> solo INSERT de clientes en SU sucursal; ve su sucursal
--   supervisor  -> lo de cajero + gestiona campanas de SU sucursal
--   admin       -> control total + WhatsApp + config
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
  for select to authenticated using (public.es_admin());

-- ---------------------------------------------------------------- whatsapp_auth
-- Sin politicas: nadie via API publica. Solo service_role (engine).

-- ---------------------------------------------------------------- config_envio
drop policy if exists config_select on public.config_envio;
create policy config_select on public.config_envio
  for select to authenticated using (public.es_admin());

drop policy if exists config_update on public.config_envio;
create policy config_update on public.config_envio
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

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
