// Normalizacion de celulares de Bolivia a formato E.164 (+591########).
// Los moviles en Bolivia tienen 8 digitos y empiezan con 6 o 7.

export function normalizarCelularBO(input: string): string | null {
  if (!input) return null
  let d = String(input).replace(/[^\d+]/g, '')
  d = d.replace(/^\+/, '')
  if (d.startsWith('591')) d = d.slice(3)
  d = d.replace(/^0+/, '')
  if (!/^[67]\d{7}$/.test(d)) return null
  return '+591' + d
}

/** true si el string ya parece un E.164 valido de Bolivia */
export function esCelularBOValido(input: string): boolean {
  return normalizarCelularBO(input) !== null
}

/** Version sin "+" para pasarle a Baileys / onWhatsApp */
export function soloDigitos(e164: string): string {
  return e164.replace(/^\+/, '')
}
