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
| **web** | Cajero registra clientes; admin de sucursal redacta campanas y las dispara |
| **Supabase** | Postgres + Auth + RLS. `campana_destinatarios` **es la cola** |
| **engine** | 1 conexion Baileys + 1 worker serial **por sucursal**. Lee su cola, verifica numero, envia con delay aleatorio y ventana horaria. Persiste la sesion en `whatsapp_auth` |

Roles (columna `rol` en `perfiles`, sin cambios de nombre en la base de datos):
- `admin` = **superadmin**: ve y gestiona todas las sucursales, WhatsApp y config de todas, crea cualquier cuenta.
- `supervisor` = **admin de sucursal**: alta de clientes + campanas + WhatsApp + config, todo limitado a SU sucursal; puede crear cuentas de `cajero` para su propia sucursal desde **Usuarios**.
- `cajero`: solo alta de clientes de su sucursal.

El engine usa la `service_role` key y **omite RLS**; la autorizacion por sucursal
(quien puede disparar campanas, reconectar WhatsApp o crear usuarios) se valida
en `apps/engine/src/api/server.ts`.

> Cada sucursal tiene su propio numero de WhatsApp, su propio QR y su propio
> tope diario / ventana horaria (`config_envio` tiene una fila por sucursal).
> Las campanas de una sucursal nunca comparten cola ni limite con las de otra.

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
1. En el proyecto Supabase -> **SQL Editor**: pega y ejecuta `supabase/schema.sql`
   (crea todo el esquema, RLS y las 3 sucursales con sus numeros).
2. **Authentication -> Users -> Add user**: crea tu **primer superadmin** (email + password).
3. Copia su UID y en el SQL Editor:
   ```sql
   insert into public.perfiles (user_id, rol, id_sucursal, nombre)
   values ('<UID>', 'admin', null, 'Admin');
   ```
   (Este es el UNICO usuario que necesitas crear a mano. Los admins de
   sucursal y los cajeros se crean despues desde el panel **Usuarios** de la web.)
4. **Project Settings -> API**: anota `Project URL`, la clave publica
   (`anon` / `publishable`, formato `sb_publishable_...`) y la `service_role` key.

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
Abre `http://localhost:5173`, inicia sesion como superadmin, ve a **WhatsApp** y
veras un QR por cada sucursal (Central, Santa Cruz, Prado) — escanea cada uno
con el celular/SIM correspondiente a ese numero.

### 5. Probar el flujo
1. En **Usuarios**, crea un admin de sucursal (`supervisor`) para Central. Ese
   admin de sucursal, al iniciar sesion, puede a su vez crear cajeros para
   Central desde la misma pantalla (queda limitado a su propia sucursal).
2. En **Caja** registra 1-2 clientes con tu propio numero.
3. En **Campanas -> Nueva**: elige sucursal, escribe el mensaje con `{nombre}`,
   guarda el borrador.
4. **Disparar**. El engine de esa sucursal crea la cola y empieza a enviar
   respetando su propio tope y delays (config en la pestana **WhatsApp**).

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
   `ADMIN_ORIGINS=https://<tu-web>.vercel.app`, `HORARIO_TZ_OFFSET=-4`.
   (Railway inyecta `PORT`. Ya no hace falta `WA_SESSION_ID`: el engine arranca
   una sesion por cada fila de `sucursales` automaticamente.)
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
