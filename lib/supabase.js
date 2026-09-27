'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Never throw while Next.js is prerendering. This keeps a fresh Vercel project
// deployable before its environment variables are added, while the application
// still shows a clear configuration screen until real credentials are present.
export const isSupabaseConfigured = Boolean(url && key);
const clientUrl = url || 'https://configuration-required.supabase.co';
const clientKey = key || 'configuration-required';

export const supabase = createClient(clientUrl, clientKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
