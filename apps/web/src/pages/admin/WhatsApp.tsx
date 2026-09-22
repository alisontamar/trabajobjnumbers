import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ConfigEnvio, Sucursal, WhatsAppEstado } from '@crm/shared'
import { useAuth } from '../../context/AuthContext'
import { engine } from '../../lib/engine'
import { supabase } from '../../lib/supabase'

const color: Record<string, string> = {
  desconectado: 'text-slate-500',
  esperando_qr: 'text-amber-600',
  conectando: 'text-blue-600',
  conectado: 'text-green-600',
}

function PanelSucursal({ sucursal }: { sucursal: Sucursal }) {
  const [estado, setEstado] = useState<WhatsAppEstado | null>(null)
  const [cfg, setCfg] = useState<ConfigEnvio | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [modoVinculo, setModoVinculo] = useState<'qr' | 'codigo'>('qr')
  const [telefono, setTelefono] = useState(sucursal.whatsapp_numero ?? '')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [pidiendoCodigo, setPidiendoCodigo] = useState(false)

  useEffect(() => {
    let vivo = true
    async function poll() {
      const { data } = await supabase
        .from('whatsapp_estado')
        .select('*')
        .eq('id_sucursal', sucursal.id)
        .maybeSingle()
      if (vivo) setEstado((data as WhatsAppEstado | null) ?? null)
    }
    void poll()
    const t = setInterval(poll, 3000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [sucursal.id])

  useEffect(() => {
    supabase
      .from('config_envio')
      .select('*')
      .eq('id_sucursal', sucursal.id)
      .maybeSingle()
      .then(({ data }) => setCfg((data as ConfigEnvio | null) ?? null))
  }, [sucursal.id])

  async function guardarCfg() {
    if (!cfg) return
    setGuardando(true)
    setMsg(null)
    const { error } = await supabase
      .from('config_envio')
      .update({
        tope_diario: cfg.tope_diario,
        delay_min_seg: cfg.delay_min_seg,
        delay_max_seg: cfg.delay_max_seg,
        hora_inicio: cfg.hora_inicio,
        hora_fin: cfg.hora_fin,
        pausa_cada: cfg.pausa_cada,
        pausa_larga_seg: cfg.pausa_larga_seg,
        activo: cfg.activo,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id_sucursal', sucursal.id)
    setGuardando(false)
    setMsg(error ? error.message : 'Configuracion guardada.')
  }

  const num = (k: keyof ConfigEnvio) => (
    <input
      type="number"
      value={cfg?.[k] as number}
      onChange={(e) => cfg && setCfg({ ...cfg, [k]: Number(e.target.value) })}
      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
    />
  )

  return (
    <section className="bg-white border rounded-xl p-5 space-y-5">
      <div>
        <h2 className="font-semibold text-slate-900">
          {sucursal.nombre}
          {sucursal.whatsapp_numero && (
            <span className="text-slate-400 font-normal"> · {sucursal.whatsapp_numero}</span>
          )}
        </h2>
        <p className="text-sm mt-1">
          Estado:{' '}
          <span className={`font-medium ${color[estado?.estado ?? 'desconectado']}`}>
            {estado?.estado ?? '—'}
          </span>
          {estado?.numero && <span className="text-slate-500"> · conectado como {estado.numero}</span>}
        </p>

        {estado?.estado !== 'conectado' && (
          <div className="mt-4">
            <div className="flex gap-1 text-xs">
              <button
                onClick={() => setModoVinculo('qr')}
                className={`px-2 py-1 rounded-md border ${
                  modoVinculo === 'qr' ? 'bg-brand-800 text-white border-brand-800' : 'text-slate-600'
                }`}
              >
                Escanear QR
              </button>
              <button
                onClick={() => setModoVinculo('codigo')}
                className={`px-2 py-1 rounded-md border ${
                  modoVinculo === 'codigo' ? 'bg-brand-800 text-white border-brand-800' : 'text-slate-600'
                }`}
              >
                Vincular con código
              </button>
            </div>

            {modoVinculo === 'qr' && estado?.estado === 'esperando_qr' && estado.qr && (
              <div className="mt-3 inline-block bg-white p-3 border rounded-lg">
                <QRCodeSVG value={estado.qr} size={220} />
                <p className="text-xs text-slate-500 mt-2 text-center">
                  WhatsApp → Dispositivos vinculados → Vincular dispositivo
                </p>
              </div>
            )}
            {modoVinculo === 'qr' && estado?.estado !== 'esperando_qr' && (
              <p className="text-xs text-slate-500 mt-2">Esperando QR del servidor…</p>
            )}

            {modoVinculo === 'codigo' && (
              <div className="mt-3 max-w-xs">
                <label className="block text-sm">
                  <span className="text-slate-600">Numero de esta sucursal (con codigo de pais)</span>
                  <input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="+59171694354"
                    className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  />
                </label>
                <button
                  onClick={async () => {
                    setMsg(null)
                    setCodigo(null)
                    setPidiendoCodigo(true)
                    try {
                      const { codigo } = await engine.solicitarCodigoWhatsApp(sucursal.id, telefono)
                      setCodigo(codigo)
                    } catch (e: any) {
                      setMsg(e?.message ?? 'Error')
                    }
                    setPidiendoCodigo(false)
                  }}
                  disabled={pidiendoCodigo || !telefono}
                  className="mt-2 text-sm px-3 py-2 rounded-md border disabled:opacity-50"
                >
                  {pidiendoCodigo ? 'Generando…' : 'Generar código'}
                </button>

                {codigo && (
                  <div className="mt-3 bg-slate-50 border rounded-md p-3 text-center">
                    <p className="text-2xl font-mono tracking-widest text-slate-900">{codigo}</p>
                    <p className="text-xs text-slate-500 mt-2">
                      Dictaselo a quien tiene el celular: WhatsApp → Dispositivos vinculados →
                      Vincular dispositivo → Vincular con número de teléfono → escribir este código.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={async () => {
              setMsg(null)
              try {
                await engine.reconectarWhatsApp(sucursal.id)
                setMsg('Reconexion solicitada.')
              } catch (e: any) {
                setMsg(e?.message ?? 'Error')
              }
            }}
            className="text-sm px-3 py-2 rounded-md border"
          >
            Reconectar
          </button>
          <button
            onClick={async () => {
              if (!confirm(`Esto cierra la sesion de ${sucursal.nombre} y pide un QR nuevo. ¿Continuar?`))
                return
              setMsg(null)
              try {
                await engine.reiniciarWhatsApp(sucursal.id)
                setMsg('Sesion reiniciada. Espera el QR.')
              } catch (e: any) {
                setMsg(e?.message ?? 'Error')
              }
            }}
            className="text-sm px-3 py-2 rounded-md border border-red-200 text-red-600"
          >
            Reiniciar sesion
          </button>
        </div>
      </div>

      {cfg && (
        <div className="border-t pt-4">
          <h3 className="font-medium text-slate-900 mb-3 text-sm">Motor de envio</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="text-slate-600">Tope diario</span>
              {num('tope_diario')}
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Delay min (seg)</span>
              {num('delay_min_seg')}
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Delay max (seg)</span>
              {num('delay_max_seg')}
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Hora inicio</span>
              {num('hora_inicio')}
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Hora fin</span>
              {num('hora_fin')}
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Pausa cada N envios</span>
              {num('pausa_cada')}
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Pausa larga (seg)</span>
              {num('pausa_larga_seg')}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 mt-6">
              <input
                type="checkbox"
                checked={cfg.activo}
                onChange={(e) => setCfg({ ...cfg, activo: e.target.checked })}
              />
              Motor activo
            </label>
          </div>

          {msg && <p className="text-sm text-slate-600 mt-3">{msg}</p>}

          <button
            onClick={() => void guardarCfg()}
            disabled={guardando}
            className="mt-4 bg-brand-800 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar configuracion'}
          </button>
        </div>
      )}
    </section>
  )
}

export default function WhatsAppPage() {
  const { perfil } = useAuth()
  const [sucursales, setSucursales] = useState<Sucursal[]>([])

  useEffect(() => {
    supabase
      .from('sucursales')
      .select('*')
      .order('nombre')
      .then(({ data }) => {
        const todas = (data as Sucursal[]) ?? []
        const visibles =
          perfil?.rol === 'admin'
            ? todas
            : todas.filter((s) => s.id === perfil?.id_sucursal)
        setSucursales(visibles)
      })
  }, [perfil])

  return (
    <div className="space-y-6">
      {sucursales.map((s) => (
        <PanelSucursal key={s.id} sucursal={s} />
      ))}
    </div>
  )
}
