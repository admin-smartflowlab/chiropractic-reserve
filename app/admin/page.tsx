// app/admin/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Admin() {
  const [msg, setMsg] = useState<string>('');

  const generateDemo = async () => {
    setMsg('生成中…');

    // 引数は省略可（デフォルト: 本日 / JST 10:00-20:00 / 60分）
    // もし任意の日付で作りたい場合は↓のように渡せます:
    // const { data, error } = await supabase.rpc('generate_demo_slots', {
    //   p_date: '2025-11-01', // YYYY-MM-DD
    // });

    const { data, error } = await supabase.rpc('generate_demo_slots');

    if (error) {
      setMsg(`失敗: ${error.message}`);
      return;
    }
    setMsg(`成功: スロットを生成/更新しました（${data ?? 0} 件）`);
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">管理ダッシュボード（デモ）</h1>
      <button className="border px-4 py-2 rounded" onClick={generateDemo}>
        今日のデモ枠を生成
      </button>
      {msg && <p>{msg}</p>}
    </main>
  );
}
