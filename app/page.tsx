// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Store = { store_id: string; name: string | null };
type Staff = { staff_id: string; store_id: string; display_name: string | null };
type Slot  = {
  slot_id: string;
  store_id: string;
  staff_id: string;
  start_at_utc: string;
  end_at_utc: string;
  status: 'open' | 'booked';
};

// 表示用：UTC → JST で "YYYY-MM-DD HH:mm" 形式の文字列
function fmtJST(iso: string) {
  return new Date(iso)
    .toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-'); // 2025/11/01 → 2025-11-01
}

/** モーダルでお客様情報を入力 → reserve_slot RPC → EdgeFunctionで確認メール送信 */
function BookButton({
  slot,
  onBooked,
}: {
  slot: Slot;
  onBooked?: () => void; // 成功時に一覧を再読込したい場合に使用
}) {
  const [open, setOpen]   = useState(false);
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg]     = useState('');

  const submit = async () => {
    setMsg('送信中…');

    // 1) 重複防止つきの予約確定（サーバRPC）
    const { error } = await supabase.rpc('reserve_slot', {
      p_slot_id: slot.slot_id,
      p_name: name,
      p_phone: phone || null,
      p_email: email || null,
    });
    if (error) {
      setMsg(`失敗: ${error.message}`);
      return;
    }

    // 2) 予約確定に成功したら、確認メール送信（Edge Function）
    const payload = {
      to: email,                 // 受信者
      name,                      // お客様氏名
      phone: phone || '',
      store_id: slot.store_id,   // A / B / C
      staff_id: slot.staff_id,   // yamada など
      start_at_jst: fmtJST(slot.start_at_utc),
      end_at_jst:   fmtJST(slot.end_at_utc),
    };

    const { error: mailErr } = await supabase.functions.invoke(
      'send-reservation-email',
      { body: payload }
    );

    if (mailErr) {
      // メールは失敗しても予約は成立しているため文言を分ける
      setMsg('予約は確定しましたが、確認メール送信に失敗しました。後ほど再送します。');
      console.error(mailErr);
    } else {
      setMsg('予約が確定しました！確認メールを送信しました。ありがとうございます。');
    }

    // 閉じる＋一覧更新（少し待ってから）
    setTimeout(() => {
      setOpen(false);
      onBooked?.();
    }, 800);
  };

  return (
    <>
      <button className="border px-3 py-1 rounded" onClick={() => setOpen(true)}>
        予約
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
          <div className="bg-white p-4 rounded shadow w-[360px] space-y-2">
            <h2 className="font-semibold">お客様情報</h2>
            <input
              className="border w-full p-2"
              placeholder="お名前 *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="border w-full p-2"
              placeholder="電話番号（任意）"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="border w-full p-2"
              placeholder="メールアドレス *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex gap-2 pt-2">
              <button className="border px-3 py-1 rounded" onClick={() => setOpen(false)}>
                閉じる
              </button>
              <button
                className="border px-3 py-1 rounded"
                onClick={submit}
                disabled={!name || !email}
              >
                送信
              </button>
            </div>
            {msg && <p className="text-sm pt-1">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}

export default function Page() {
  const [stores, setStores] = useState<Store[]>([]);
  const [staff,  setStaff]  = useState<Staff[]>([]);
  const [slots,  setSlots]  = useState<Slot[]>([]);
  const [store,  setStore]  = useState<string>('');
  const [person, setPerson] = useState<string>('');

  // 初期ロード：店舗・スタッフ
  useEffect(() => {
    (async () => {
      const { data: st } = await supabase
        .from('stores')
        .select('store_id,name')
        .order('store_id');
      const { data: sf } = await supabase
        .from('staff')
        .select('staff_id,store_id,display_name')
        .order('staff_id');
      setStores(st ?? []);
      setStaff(sf ?? []);
    })();
  }, []);

  // 枠の取得（選択に応じて）
  const fetchSlots = async () => {
    if (!store || !person) { setSlots([]); return; }
    const { data } = await supabase
      .from('slots')
      .select('slot_id,store_id,staff_id,start_at_utc,end_at_utc,status')
      .eq('store_id', store)
      .eq('staff_id', person)
      .gte('start_at_utc', new Date(new Date().setHours(0,0,0,0)).toISOString())
      .order('start_at_utc');
    setSlots(data ?? []);
  };
  useEffect(() => { fetchSlots(); }, [store, person]);

  const staffOfStore = useMemo(
    () => staff.filter(s => s.store_id === store),
    [staff, store]
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">整体院 予約デモ</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <div className="text-sm text-gray-600">店舗</div>
          <select
            className="w-full border rounded-md p-2"
            value={store}
            onChange={(e) => { setStore(e.target.value); setPerson(''); }}
          >
            <option value="">選択してください</option>
            {stores.map((s) => (
              <option key={s.store_id} value={s.store_id}>
                {s.store_id}：{s.name ?? ''}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-sm text-gray-600">スタッフ</div>
          <select
            className="w-full border rounded-md p-2"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            disabled={!store}
          >
            <option value="">選択してください</option>
            {staffOfStore.map((m) => (
              <option key={m.staff_id} value={m.staff_id}>
                {m.display_name ?? m.staff_id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-gray-600">空き枠（本日以降）</div>
        <ul className="divide-y rounded-md border">
          {(!store || !person) && (
            <li className="p-3 text-gray-500">店舗とスタッフを選ぶと表示されます</li>
          )}
          {slots.map((sl) => (
            <li key={sl.slot_id} className="p-3 flex items-center justify-between gap-3">
              <span>{fmtJST(sl.start_at_utc)} - {fmtJST(sl.end_at_utc)}</span>
              {sl.status === 'open' ? (
                <BookButton slot={sl} onBooked={fetchSlots} />
              ) : (
                <span className="text-sm px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                  booked
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
