# CRM Difusion

CRM a medida para captar clientes en caja + motor de difusion por WhatsApp
que despacha mensajes uno a uno con pausas humanas.

```
trabajobj/
├── apps/
│   ├── web/      React + Vite + Tailwind   -> Vercel / Cloudflare Pages
│   └── engine/   Node + TS + Baileys       -> Railway (proceso 24/7)
├── packages/
│   └── shared/   tipos + normalizacion de celulares (compartido)
└── supabase/
    ├── migrations/   0001_init.sql, 0002_rls.sql
    └── seed.sql
```

## Arquitectura

| Pieza | Rol |
|---|---|
| **web** | Cajero registra clientes; admin redacta campanas y las dispara |
| **Supabase** | Postgres + Auth + RLS. `campana_destinatarios` **es la cola** |
| **engine** | 1 conexion Baileys + 1 worker serial. Lee la cola, verifica numero, envia con delay aleatorio y ventana horaria. Persiste la sesion en `whatsapp_auth` |

Roles: `cajero` (alta de clientes de su sucursal), `supervisor` (+ campanas de su
sucursal), `admin` (todo + WhatsApp + config). El engine usa la `service_role` key
y **omite RLS**.

> Un solo numero de WhatsApp = un solo tope de envio diario compartido por todas
> las sucursales. El worker es una unica cola serial global; las campanas de
> distintas sucursales se intercalan.

---

## Puesta en marcha

### 0. Requisitos
- Node.js 20+
- Cuenta Supabase (ya la tienes)
- Cuenta Railway (crear)
- Un numero/SIM dedicado para WhatsApp, con verificacion en dos pasos

### 1. Instalar dependencias (en la raiz)
```bash
npm install
```

### 2. Supabase
1. En el proyecto Supabase -> **SQL Editor**:
   - Pega y ejecuta `supabase/migrations/0001_init.sql`
   - Pega y ejecuta `supabase/migrations/0002_rls.sql`
   - Pega y ejecuta `supabase/seed.sql`
2. **Authentication -> Users -> Add user**: crea tu usuario admin (email + password).
3. Copia su UID y en el SQL Editor:
   ```sql
   insert into public.perfiles (user_id, rol, id_sucursal, nombre)
   values ('<UID>', 'admin', null, 'Admin');
   ```
4. **Project Settings -> API**: anota `Project URL`, la `anon` key y la
   `service_role` key.

### 3. Engine (local)
```bash
cd apps/engine
cp .env.example .env      # completa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
npm run dev
```
Arranca en `http://localhost:8080`. Al conectar genera un QR que veras en el panel.

### 4. Web (local)
```bash
cd apps/web
cp .env.example .env      # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ENGINE_URL=http://localhost:8080
npm run dev
```
Abre `http://localhost:5173`, inicia sesion como admin, ve a **WhatsApp** y escanea el QR.

### 5. Probar el flujo
1. Crea un cajero/supervisor: **Authentication -> Users -> Add user**, luego
   ```sql
   insert into public.perfiles (user_id, rol, id_sucursal, nombre)
   values ('<UID>', 'cajero',
           (select id from public.sucursales where nombre = 'Central'), 'Cajero 1');
   ```
2. En **Caja** registra 1-2 clientes con tu propio numero.
3. En **Campanas -> Nueva**: elige sucursal, escribe el mensaje con `{nombre}`,
   guarda el borrador.
4. **Disparar**. El engine crea la cola y empieza a enviar respetando el tope y
   los delays (config en la pestana **WhatsApp**).

---

## Despliegue

### Web -> Vercel (o Cloudflare Pages)
- Root del proyecto: `apps/web`
- Build: `npm run build`  ·  Output: `dist`
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_ENGINE_URL=https://<servicio>.up.railway.app`
- `vercel.json` ya incluye el rewrite SPA.

### Engine -> Railway
1. New Project -> Deploy from GitHub repo.
2. **Root Directory**: `apps/engine`  (Nixpacks detecta Node; hay `Dockerfile` de respaldo).
3. Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ADMIN_ORIGINS=https://<tu-web>.vercel.app`, `WA_SESSION_ID=default`,
   `HORARIO_TZ_OFFSET=-4`. (Railway inyecta `PORT`.)
4. Deploy. Copia la URL publica y ponla en `VITE_ENGINE_URL` de la web.

Costo aprox: web gratis + Railway Hobby ~$5/mes.

---

## Notas sobre el riesgo de bloqueo (Baileys)

Baileys **no es oficial**; el envio masivo va contra los terminos de WhatsApp.
Mitigaciones ya implementadas / configurables:
- Cola **serial**, un mensaje a la vez, delay aleatorio (`config_envio`).
- **Tope diario** bajo por defecto (30). Sube de a poco durante 2-3 semanas.
- **Ventana horaria** (9-20 por defecto).
- Solo se envia a clientes con `consentimiento = true` y `estado = activo`.
- Se respeta `opt_outs`.
- "Simulacion de escritura" (presence `composing`) antes de cada mensaje.

Aun asi, asume que el numero puede terminar bloqueado. Si el piloto funciona,
migrar a **WhatsApp Cloud API** (oficial). La base de datos no cambia; solo se
reemplaza `apps/engine/src/whatsapp/`.
