'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  committee_secretary: '차량위원회 간사',
  committee_vice: '차량위원회 부위원장',
  committee_chair: '차량위원회 위원장',
  admin: '시스템 관리자',
};

const ROLE_ICON_COLOR: Record<string, string> = {
  committee_secretary: 'bg-violet-600',
  committee_vice: 'bg-fuchsia-600',
  committee_chair: 'bg-purple-700',
  admin: 'bg-indigo-600',
};

export default function CommitteeProfilePage() {
  const router = useRouter();
  const [user, setUser]       = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [pwForm,    setPwForm]    = useState({ next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg,     setPwMsg]     = useState('');
  const [pwError,   setPwError]   = useState('');
  const [showPw,    setShowPw]    = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/auth/me').then(r => r.json());
    setUser(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwMsg('');
    if (pwForm.next.length < 6) { setPwError('비밀번호는 최소 6자 이상이어야 합니다'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('새 비밀번호가 일치하지 않습니다'); return; }
    setPwLoading(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: pwForm.next }),
    });
    const json = await res.json();
    if (json.error) setPwError(json.error);
    else { setPwMsg('비밀번호가 변경되었습니다'); setPwForm({ next: '', confirm: '' }); }
    setPwLoading(false);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const roleLabel = ROLE_LABELS[user?.role] ?? '차량위원회';
  const iconBg    = ROLE_ICON_COLOR[user?.role] ?? 'bg-purple-700';

  return (
    <div className="flex flex-col min-h-full pb-4">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">내 정보</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">

        {/* 프로필 카드 */}
        <div className="bg-gradient-to-br from-purple-700 to-indigo-700 rounded-2xl px-4 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex flex-col items-center justify-center ${iconBg} rounded-xl px-3 py-2.5 flex-shrink-0 gap-1.5`}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-white text-[10px] font-bold tracking-tight whitespace-nowrap">차량위원회</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight">{user?.name}</p>
              <p className="text-white/75 text-xs mt-0.5 font-medium">{roleLabel}</p>
              <p className="text-white/60 text-xs mt-0.5">{user?.phone || '-'}</p>
            </div>
          </div>
        </div>

        {/* 계정 정보 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-800">계정 정보</p>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { label: '이름',   value: user?.name },
              { label: '연락처', value: user?.phone || '-' },
              { label: '직책',   value: roleLabel },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <button onClick={() => setShowPw(!showPw)}
            className="w-full flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-bold text-gray-800 text-left">비밀번호 변경</p>
              <p className="text-xs text-gray-400 mt-0.5">정기적인 비밀번호 변경을 권장합니다</p>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showPw ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showPw && (
            <form onSubmit={changePassword} className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              {pwError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">{pwError}</div>
              )}
              {pwMsg && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-sm text-green-700 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {pwMsg}
                </div>
              )}
              {[
                { label: '새 비밀번호',     key: 'next',    placeholder: '6자 이상 입력' },
                { label: '새 비밀번호 확인', key: 'confirm', placeholder: '비밀번호 재입력' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    {f.label} <span className="text-red-500">*</span>
                  </label>
                  <input type="password" value={(pwForm as any)[f.key]}
                    onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              ))}
              <button type="submit" disabled={pwLoading}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-60 transition-colors">
                {pwLoading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          )}
        </div>

        {/* 로그아웃 */}
        <button onClick={handleLogout}
          className="w-full bg-white border border-gray-200 text-red-500 py-3.5 rounded-2xl text-sm font-semibold shadow-sm">
          로그아웃
        </button>
      </div>
    </div>
  );
}
