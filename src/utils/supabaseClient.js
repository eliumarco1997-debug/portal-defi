import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan las variables de entorno de Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY). Por favor configúralas.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper para llamar al bot con el secret header automáticamente
const BOT_API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3002' : '');
const BOT_SECRET = import.meta.env.VITE_BOT_SECRET || '';

export async function botFetch(path, options = {}) {
  const url = `${BOT_API_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(BOT_SECRET ? { 'x-bot-secret': BOT_SECRET } : {}),
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}
