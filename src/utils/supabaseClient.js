import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY). Por favor configúralas.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper para llamar al bot con token de autenticación automáticamente
const BOT_API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3002' : '');

export async function botFetch(path, options = {}) {
  // Obtener sesión activa para extraer el access_token JWT
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const url = `${BOT_API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}
