/**
 * Normalización de teléfonos argentinos para comparar números escritos en distintos formatos.
 *
 * Ejemplos que dan el mismo resultado (10 dígitos: código de área + número):
 *   "+54 9 11 5555-4444", "54 9 11 55554444", "011 15 5555-4444", "(011) 15-5555-4444",
 *   "11 5555 4444", "1155554444"
 *
 * Se compara el número completo, incluido el código de área: dos números distintos
 * no coinciden aunque compartan los últimos dígitos.
 *
 * Limitación: esto solo compara formatos. No es una verificación de identidad.
 */
export function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';

  // Prefijo internacional de salida (00) y código de país (54)
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) digits = digits.slice(2);

  // Indicador de celular después del código de país (9)
  if (digits.length === 11 && digits.startsWith('9')) digits = digits.slice(1);

  // Troncal nacional (0) antes del código de área
  if (digits.startsWith('0')) digits = digits.slice(1);

  // Prefijo "15" de celular escrito después del código de área (áreas de 2, 3 o 4 dígitos)
  if (digits.length === 12) {
    for (const areaLength of [2, 3, 4]) {
      if (digits.substring(areaLength, areaLength + 2) === '15') {
        const candidate = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
        if (candidate.length === 10) {
          digits = candidate;
          break;
        }
      }
    }
  }

  return digits;
}

/** true si ambos teléfonos normalizados son iguales y no están vacíos. */
export function isSamePhone(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na !== '' && na === nb;
}
