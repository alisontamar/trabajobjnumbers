// Tipos compartidos entre la web (React) y el motor (engine).
// Reflejan las tablas de Supabase. Mantener sincronizado con supabase/migrations.

export type Rol = 'cajero' | 'supervisor' | 'admin'

export type EstadoCliente = 'activo' | 'baja'

export type EstadoCampana = 'borrador' | 'en_curso' | 'pausada' | 'finalizada'

export type EstadoDestinatario =
  | 'pendiente'
  | 'enviado'
  | 'fallido'
  | 'sin_whatsapp'
  | 'omitido'

export type EstadoConexionWhatsApp =
  | 'desconectado'
  | 'esperando_qr'
  | 'conectando'
  | 'conectado'

export interface Sucursal {
  id: string
  nombre: string
  creado_en: string
}

export interface Perfil {
  user_id: string
  rol: Rol
  id_sucursal: string | null
  nombre: string | null
  creado_en: string
}

export interface Cliente {
  id: string
  nombre: string
  celular_e164: string
  id_sucursal: string
  consentimiento: boolean
  consent_fecha: string | null
  estado: EstadoCliente
  creado_por: string | null
  creado_en: string
}

/** Filtro de segmento guardado como jsonb en campanas.segmento */
export interface SegmentoCampana {
  creados_desde?: string // ISO date
  creados_hasta?: string // ISO date
}

export interface Campana {
  id: string
  id_sucursal: string
  nombre: string
  plantilla_texto: string
  segmento: SegmentoCampana
  estado: EstadoCampana
  programada_para: string | null
  creada_por: string | null
  creada_en: string
}

export interface CampanaDestinatario {
  id: string
  id_campana: string
  id_cliente: string
  celular_snapshot: string
  estado: EstadoDestinatario
  intento: number
  error: string | null
  enviado_en: string | null
  creado_en: string
}

export interface ConfigEnvio {
  id: string
  tope_diario: number
  delay_min_seg: number
  delay_max_seg: number
  hora_inicio: number
  hora_fin: number
  pausa_cada: number
  pausa_larga_seg: number
  contador_fecha: string | null
  contador_hoy: number
  activo: boolean
  actualizado_en: string
}

export interface WhatsAppEstado {
  id: string
  estado: EstadoConexionWhatsApp
  qr: string | null
  numero: string | null
  actualizado_en: string
}

/** Reemplaza los placeholders de una plantilla: {nombre}, {sucursal} */
export function renderPlantilla(
  plantilla: string,
  datos: { nombre?: string | null; sucursal?: string | null },
): string {
  return plantilla
    .replace(/\{nombre\}/gi, (datos.nombre ?? '').trim())
    .replace(/\{sucursal\}/gi, (datos.sucursal ?? '').trim())
}
