import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Configuración leída desde .env.local (variables VITE_*). Sin valores, la app sigue funcionando
// con el almacenamiento local, como hasta ahora.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const SUPABASE_URL = env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * Prueba de conexión sin leer ni escribir datos: solo pide la sesión actual.
 * No requiere tablas ni permisos especiales.
 */
export async function checkSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  if (!supabase) {
    return { ok: false, message: 'Falta completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.' };
  }
  const { error } = await supabase.auth.getSession();
  if (error) {
    return { ok: false, message: `Supabase respondió con un error: ${error.message}` };
  }
  return { ok: true, message: 'Conexión con Supabase correcta.' };
}
