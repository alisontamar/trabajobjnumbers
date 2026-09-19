import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ConfigEnvio, WhatsAppEstado } from '@crm/shared'
import { engine } from '../../lib/engine'
import { supabase } from '../../lib/supabase'

const color: Record<string, string> = {
  desconectado: 'text-slate-500',
  esperando_qr: 'text-amber-600',
  conectando: 'text-blue-600',
  conectado: 'text-green-600',
}

export default function WhatsAppPage() {
  const [estado, setEstado] = useState<WhatsAppEstado | null>(null)
  const [cfg, setCfg] = useState<ConfigEnvio | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    let vivo = true
    async function poll() {
      const { data } = await supabase
        .from('whatsapp_estado')
        .select('*')
        .eq('id', 'default')
        .maybeSingle()
      if (vivo) setEstado((data as WhatsAppEstado | null) ?? null)
    }
    void poll()
    const t = setInterval(poll, 3000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    supabase
      .from('config_envio')
      .select('*')
      .eq('id', 'default')
      .maybeSingle()
      .then(({ data }) => setCfg((data as ConfigEnvio | null) ?? null))
  }, [])

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
      .eq('id', 'default')
    setGuardando(false)
    setMsg(error ? error.message : 'Configuracion guardada.')
  }

  const num = (k: keyof ConfigEnvio) => (
    <input
      type="number"
      value={cfg?.[k] as number}
      onChange={(e) =>
        cfg && setCfg({ ...cfg, [k]: Number(e.target.value) })
      }
      className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
    />
  )

  return (
    <div className="space-y-6">
      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Conexion WhatsApp</h2>
        <p className="text-sm">
          Estado:{' '}
          <span className={`font-medium ${color[estado?.estado ?? 'desconectado']}`}>
            {estado?.estado ?? '—'}
          </span>
          {estado?.numero && (
            <span className="text-slate-500"> · {estado.numero}</span>
          )}
        </p>

        {estado?.estado === 'esperando_qr' && estado.qr && (
          <div className="mt-4 inline-block bg-white p-3 border rounded-lg">
            <QRCodeSVG value={estado.qr} size={240} />
            <p className="text-xs text-slate-500 mt-2 text-center">
              WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={async () => {
              setMsg(null)
              try {
                await engine.reconectarWhatsApp()
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
              if (!confirm('Esto cierra la sesion y pide un QR nuevo. ¿Continuar?'))
                return
              setMsg(null)
              try {
                await engine.reiniciarWhatsApp()
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
      </section>

      {cfg && (
        <section className="bg-white border rounded-xl p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Motor de envio</h2>
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
            className="mt-4 bg-slate-900 text-white rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar configuracion'}
          </button>
        </section>
      )}
    </div>
  )
}
