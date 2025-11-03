// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// .env が未設定だと Next がモジュール評価時に落ちるので保険
if (!url?.startsWith('http')) {
  throw new Error('Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.');
}

export const supabase = createClient(url, anon);
