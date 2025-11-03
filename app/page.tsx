// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

const QUESTIONNAIRE_URL = 'https://forms.gle/E58ZtR4J3n3pcytp7';

// UTC → JST 文字列
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
    .replace(/\//g, '-');
}

function BookButton({ slot, onBooked }: { slot: Slot; onBooked?: () => void }) {
  const [open, setOpen]   = useState(false);
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg]     = useState('');

  // bodyスクロール制御
  useEffect(() => {
    if (open) {
      const y = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${y}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      const y = parseInt(document.body.style.top || '0') * -1;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (y) window.scrollTo(0, y);
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
    };
  }, [open]);

  const submit = async () => {
    setMsg('送信中…');

    // 1) 予約確定（RPC）
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

    // 2) 確認メール（Edge Function）
    const payload = {
      to: email,
      name,
      phone: phone || '',
      store_id: slot.store_id,
      staff_id: slot.staff_id,
      start_at_jst: fmtJST(slot.start_at_utc),
      end_at_jst:   fmtJST(slot.end_at_utc),
    };

    const { error: mailErr } = await supabase.functions.invoke(
      'send-reservation-email',
      { body: payload }
    );

    if (mailErr) {
      setMsg('予約は確定しましたが、確認メール送信に失敗しました。後ほど再送します。下のボタンから事前問診にご回答ください。');
      console.error(mailErr);
    } else {
      setMsg('ご予約が完了しました！✨ 確認メールをお送りしました。下のボタンから事前問診にご回答ください。');
    }

    // 自動クローズしない（お客さまが閉じるまで表示）
    // setTimeout(() => { setOpen(false); onBooked?.(); }, 1500);
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-reserve"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
        aria-label="この時間枠を予約する"
      >
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        予約する
      </button>

      {open && createPortal(
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={() => setOpen(false)} aria-label="モーダルを閉じる" />
          <div className="modal-wrapper">
            <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <div className="modal-header">
                <div className="modal-header-icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 id="modal-title" className="modal-title">ご予約情報の入力</h2>
                  <p className="modal-subtitle">以下の項目をご入力いただき、予約を確定してください</p>
                </div>
              </div>

              <div className="modal-body">
                <div className="booking-time-info">
                  <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div>
                    <div className="booking-date">{fmtJST(slot.start_at_utc).split(' ')[0]}</div>
                    <div className="booking-time">
                      {fmtJST(slot.start_at_utc).split(' ')[1]} - {fmtJST(slot.end_at_utc).split(' ')[1]}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="customer-name" className="form-label">お名前 <span className="required">*</span></label>
                  <input id="customer-name" type="text" className="form-input" placeholder="例）山田 太郎"
                    value={name} onChange={(e) => setName(e.target.value)} required aria-required="true" />
                </div>

                <div className="form-group">
                  <label htmlFor="customer-phone" className="form-label">お電話番号 <span className="optional">（任意）</span></label>
                  <input id="customer-phone" type="tel" className="form-input" placeholder="例）090-1234-5678"
                    value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="電話番号を入力" />
                </div>

                <div className="form-group">
                  <label htmlFor="customer-email" className="form-label">メールアドレス <span className="required">*</span></label>
                  <input id="customer-email" type="email" className="form-input" placeholder="例）example@email.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required aria-required="true" />
                  <p className="form-help">ご入力いただいたメールアドレスに予約確認メールをお送りします</p>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} aria-label="予約をキャンセルして閉じる">キャンセル</button>
                <button type="button" className="btn btn-primary btn-submit" onClick={submit} disabled={!name || !email} aria-disabled={!name || !email}>予約を確定する</button>
              </div>

              {/* メッセージ + 事前問診CTA + 閉じるボタン */}
              {msg && (
                <>
                  <div
                    className={`message ${
                      msg.includes('完了') ? 'message-success'
                      : msg.includes('失敗') ? 'message-error'
                      : 'message-info'
                    }`}
                    role="status" aria-live="polite"
                  >
                    {msg}
                  </div>

                  <a
                    href={QUESTIONNAIRE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-accent btn-lg"
                    style={{ marginTop: 12, width: '100%' }}
                    aria-label="事前問診へ進む（新しいタブで開きます）"
                  >
                    📝 事前問診に進む
                  </a>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => { setOpen(false); onBooked?.(); }}
                  >
                    閉じる
                  </button>
                </>
              )}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}

export default function Page() {
  const [stores, setStores] = useState<Store[]>([]);
  const [staff,  setStaff]  = useState<Staff[]>([]);
  const [slots,  setSlots]  = useState<Slot[]>([]);
  const [store,  setStore]  = useState<string>('');
  const [person, setPerson] = useState<string>('');

  // 初期ロード
  useEffect(() => {
    (async () => {
      const { data: st } = await supabase.from('stores').select('store_id,name').order('store_id');
      const { data: sf } = await supabase.from('staff').select('staff_id,store_id,display_name').order('staff_id');
      setStores(st ?? []); setStaff(sf ?? []);
    })();
  }, []);

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

  const staffOfStore = useMemo(() => staff.filter(s => s.store_id === store), [staff, store]);

  return (
    <div className="page-container">
      {/* ヘッダー・フィルタ・一覧（あなたの既存UIそのまま） */}
      {/* …中略。slots の描画だけ載せます … */}
      <section className="slots-section">
        <div className="section-header">
          <h2 className="section-title">予約可能な時間枠</h2>
          <p className="section-description">ご希望の日時をお選びください</p>
        </div>

        {(!store || !person) ? (
          <div className="empty-state"><p>店舗と担当スタッフを選択してください</p></div>
        ) : slots.length === 0 ? (
          <div className="empty-state"><p>現在予約可能な時間枠がありません</p></div>
        ) : (
          <ul className="slots-list">
            {slots.map(sl => (
              <li key={sl.slot_id} className="slot-item">
                <div className="time-info">
                  <div>{fmtJST(sl.start_at_utc).split(' ')[0]}</div>
                  <div>{fmtJST(sl.start_at_utc).split(' ')[1]} - {fmtJST(sl.end_at_utc).split(' ')[1]}</div>
                </div>
                {sl.status === 'open' ? (
                  <BookButton slot={sl} onBooked={fetchSlots} />
                ) : (
                  <div className="badge badge-booked">予約済み</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
