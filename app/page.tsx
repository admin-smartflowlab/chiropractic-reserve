// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';

// 事前問診フォーム（Googleフォーム）
const QUESTIONNAIRE_URL = 'https://forms.gle/E58ZtR4J3n3pcytp7';

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

// 表示用:UTC → JST で "YYYY-MM-DD HH:mm"
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

/** モーダル:お客様情報 → reserve_slot RPC → Edge Functionで確認メール送信 */
function BookButton({
  slot,
  onBooked,
}: {
  slot: Slot;
  onBooked?: () => void; // 成功時に一覧を再読込したい場合に使用
}) {
  const [open, setOpen]         = useState(false);
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [msg, setMsg]           = useState('');
  const [finished, setFinished] = useState(false); // 完了後 true（自動で閉じない）
  const [submitting, setSubmitting] = useState(false);

  // モーダル開閉時にbodyのスクロールを制御
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      const top = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (top) window.scrollTo(0, parseInt(top) * -1);
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
    };
  }, [open]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
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
      setSubmitting(false);
      return;
    }

    // 2) 予約確定 → 確認メール送信（Edge Function）
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
      setMsg('予約は確定しましたが、確認メール送信に失敗しました。後ほど再送します。');
      console.error(mailErr);
    } else {
      setMsg('ご予約が完了しました！✨ 確認メールをお送りしましたのでご確認ください。');
    }

    setFinished(true);      // ← 自動クローズせず、ユーザーが「閉じる」を押すまで表示
    setSubmitting(false);
  };

  return (
    <>
      {/* 予約ボタン（フォーカス連鎖でカードが開くチラつき防止） */}
      <button
        type="button"
        className="btn btn-primary btn-reserve"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(true)}
        aria-label="この時間枠を予約する"
      >
        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
        予約する
      </button>

      {/* モーダル（bodyへポータル） */}
      {open && createPortal(
        <div className="modal-overlay">
          <div
            className="modal-backdrop"
            onClick={() => { if (!finished) setOpen(false); }} // 完了後は誤タップで閉じない
            aria-label="モーダルを閉じる"
          />
          <div className="modal-wrapper">
            <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <div className="modal-header">
                <div className="modal-header-icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <div>
                    <div className="booking-date">{fmtJST(slot.start_at_utc).split(' ')[0]}</div>
                    <div className="booking-time">
                      {fmtJST(slot.start_at_utc).split(' ')[1]} - {fmtJST(slot.end_at_utc).split(' ')[1]}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="customer-name" className="form-label">
                    <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    お名前 <span className="required">*</span>
                  </label>
                  <input id="customer-name" type="text" className="form-input" placeholder="例）山田 太郎"
                         value={name} onChange={(e) => setName(e.target.value)} required aria-required="true" />
                </div>

                <div className="form-group">
                  <label htmlFor="customer-phone" className="form-label">
                    <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    お電話番号 <span className="optional">（任意）</span>
                  </label>
                  <input id="customer-phone" type="tel" className="form-input" placeholder="例）090-1234-5678"
                         value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="電話番号を入力" />
                </div>

                <div className="form-group">
                  <label htmlFor="customer-email" className="form-label">
                    <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                    メールアドレス <span className="required">*</span>
                  </label>
                  <input id="customer-email" type="email" className="form-input" placeholder="例）example@email.com"
                         value={email} onChange={(e) => setEmail(e.target.value)} required aria-required="true" />
                  <p className="form-help">
                    <svg className="icon icon-xs" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    ご入力いただいたメールアドレスに予約確認メールをお送りします
                  </p>
                </div>

                {/* 常時表示の事前問診CTA（予約前でも確認できる） */}
                <div className="notice info" role="note" aria-live="polite">
                  <strong>ご予約後のお願い：</strong>
                  ご来院前に
                  <a href={QUESTIONNAIRE_URL} target="_blank" rel="noopener noreferrer" className="link-cta">
                    事前問診フォーム
                  </a>
                  のご入力にご協力ください（所要1〜2分）。
                </div>
              </div>

              <div className="modal-footer">
                {finished ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setOpen(false);
                      setMsg('');
                      setFinished(false);
                      onBooked?.();
                    }}
                    aria-label="メッセージを閉じる"
                  >
                    閉じる
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setOpen(false)}
                      aria-label="予約をキャンセルして閉じる"
                      disabled={submitting}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-submit"
                      onClick={submit}
                      disabled={!name || !email || submitting}
                      aria-disabled={!name || !email || submitting}
                    >
                      予約を確定する
                    </button>
                  </>
                )}
              </div>

              {/* メッセージを固定表示＋予約後はフォームCTAを強調 */}
              {msg && (
                <div
                  className={`message ${
                    msg.includes('完了') ? 'message-success'
                    : msg.includes('失敗') ? 'message-error'
                    : 'message-info'
                  }`}
                  role="alert"
                  aria-live="assertive"
                >
                  <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {msg.includes('完了') && (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    )}
                    {msg.includes('失敗') && (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    )}
                    {!msg.includes('完了') && !msg.includes('失敗') && (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    )}
                  </svg>
                  <div className="message-content">
                    <p>{msg}</p>

                    {/* 予約完了/メール失敗どちらでも、フォームCTAを強調表示 */}
                    {finished && (
                      <div className="questionnaire-cta">
                        <p className="cta-title">📋 ご来院前のご協力をお願いいたします</p>
                        <a
                          href={QUESTIONNAIRE_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-cta"
                          aria-label="事前問診フォームを新しいタブで開く"
                        >
                          <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                          事前問診フォームを開く
                        </a>
                        <p className="cta-help">所要時間 1〜2 分。送信後もこの画面は閉じません。</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
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

  // 初期ロード:店舗・スタッフ
  useEffect(() => {
    (async () => {
      const { data: st } = await supabase.from('stores').select('store_id,name').order('store_id');
      const { data: sf } = await supabase.from('staff').select('staff_id,store_id,display_name').order('staff_id');
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
  useEffect(() => { fetchSlots(); }, [store, person]); // eslint-disable-line

  const staffOfStore = useMemo(() => staff.filter(s => s.store_id === store), [staff, store]);

  return (
    <>
      <div className="page-container">
        <header className="page-header">
          <div className="header-content">
            <div className="header-icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="header-text">
              <h1 className="page-title">整体院 オンライン予約</h1>
              <p className="page-subtitle">
                <svg className="icon icon-inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                まずは店舗とスタッフをお選びください
              </p>
            </div>
          </div>
        </header>

        <main className="page-main">
          {/* --- フィルタ --- */}
          <section className="filter-section">
            <div className="section-header">
              <h2 className="section-title">
                <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
                </svg>
                ご予約条件の選択
              </h2>
              <p className="section-description">
                ご希望の店舗と担当スタッフをお選びください
              </p>
            </div>

            <div className="filter-grid">
              <div className="form-group">
                <label htmlFor="store-select" className="form-label">
                  <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                  店舗を選択
                </label>
                <div className="select-wrapper">
                  <select
                    id="store-select"
                    className="form-select"
                    value={store}
                    onChange={(e) => { setStore(e.target.value); setPerson(''); }}
                    aria-label="店舗を選択してください"
                  >
                    <option value="">店舗を選んでください</option>
                    {stores.map((s) => (
                      <option key={s.store_id} value={s.store_id}>
                        {s.name ?? s.store_id}
                      </option>
                    ))}
                  </select>
                  <svg className="select-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="staff-select" className="form-label">
                  <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  担当スタッフを選択
                </label>
                <div className="select-wrapper">
                  <select
                    id="staff-select"
                    className="form-select"
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    disabled={!store}
                    aria-label="スタッフを選択してください"
                  >
                    <option value="">スタッフを選んでください</option>
                    {staffOfStore.map((m) => (
                      <option key={m.staff_id} value={m.staff_id}>
                        {m.display_name ?? m.staff_id}
                      </option>
                    ))}
                  </select>
                  <svg className="select-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>
                {!store && (
                  <p className="form-help">
                    <svg className="icon icon-xs" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    まず店舗を選択してください
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ------- 枠リスト -------- */}
          <section className="slots-section">
            <div className="section-header">
              <h2 className="section-title">
                <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                予約可能な時間枠
              </h2>
              <p className="section-description">ご希望の日時をお選びいただき、ご予約ください</p>
            </div>

            {(!store || !person) ? (
              <div className="empty-state">
                <div className="empty-icon-wrapper">
                  <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                </div>
                <h3 className="empty-title">予約枠を表示する準備ができました</h3>
                <p className="empty-text">
                  上記のフォームから店舗と担当スタッフを選択すると、<br />
                  予約可能な時間枠が表示されます
                </p>
              </div>
            ) : slots.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon-wrapper empty-icon-wrapper-warning">
                  <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <h3 className="empty-title">現在予約可能な時間枠がありません</h3>
                <p className="empty-text">
                  別の店舗またはスタッフをお選びいただくか、<br />
                  後ほど再度お試しください
                </p>
              </div>
            ) : (
              <ul className="slots-list">
                {slots.map((sl) => (
                  <li key={sl.slot_id} className="slot-item">
                    <div className="slot-time">
                      <div className="slot-icon-wrapper">
                        <svg className="slot-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </div>
                      <div className="time-info">
                        <div className="time-date">
                          <svg className="icon icon-xs" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                          </svg>
                          {fmtJST(sl.start_at_utc).split(' ')[0]}
                        </div>
                        <div className="time-range">
                          {fmtJST(sl.start_at_utc).split(' ')[1]} - {fmtJST(sl.end_at_utc).split(' ')[1]}
                        </div>
                      </div>
                    </div>

                    {sl.status === 'open' ? (
                      <BookButton slot={sl} onBooked={fetchSlots} />
                    ) : (
                      <div className="badge badge-booked">
                        <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                        </svg>
                        予約済み
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <footer className="page-footer">
          <div className="footer-content">
            <svg className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p className="footer-text">
              ご不明な点やご質問がございましたら、お気軽にお問い合わせください
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}