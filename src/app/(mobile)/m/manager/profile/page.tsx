'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Department { id: string; name: string; }

export default function ManagerProfilePage() {
  const router = useRouter();
  const [user,       setUser]       = useState<any>(null);
  const [allDepts,   setAllDepts]   = useState<Department[]>([]);
  const [myDeptIds,  setMyDeptIds]  = useState<string[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [savingDepts, setSavingDepts] = useState(false);
  const [deptMsg,    setDeptMsg]    = useState('');

  const [pwForm,    setPwForm]    = useState({ next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg,     setPwMsg]     = useState('');
  const [pwError,   setPwError]   = useState('');
  const [showPw,    setShowPw]    = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [meRes, deptsRes, myDeptsRes] = await Promise.all([
      fetch('/api/auth/me').then(r => r.json()),
      fetch('/api/departments').then(r => r.json()),
      fetch('/api/user-departments').then(r => r.json()),
    ]);
    setUser(meRes.data);
    setAllDepts(deptsRes.data || []);
    setMyDeptIds((myDeptsRes.data || []).map((d: any) => d.id));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function toggleDept(id: string) {
    setMyDeptIds(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  }

  async function saveDepts() {
    setSavingDepts(true); setDeptMsg('');
    const res = await fetch('/api/user-departments', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_ids: myDeptIds }),
    });
    const json = await res.json();
    setDeptMsg(json.error ? json.error : '소속이 저장되었습니다');
    setSavingDepts(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(''); setPwMsg('');
    if (pwForm.next.length < 6)          { setPwError('비밀번호는 최소 6자 이상이어야 합니다'); return; }
    if (pwForm.next !== pwForm.confirm)  { setPwError('새 비밀번호가 일치하지 않습니다'); return; }
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
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const myDepts = allDepts.filter(d => myDeptIds.includes(d.id));

  return (
    <div className="flex flex-col min-h-full pb-4">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">내 정보</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">

        {/* 프로필 카드 */}
        <div className="bg-[#02AA4B] rounded-2xl px-4 py-3.5">
          {/* 아바타 + 이름·연락처 */}
          <div className="flex items-center gap-3 mb-3">
            {/* 아바타 박스: 이니셜 + 직책 배지 */}
            <div className="flex flex-col items-center justify-center bg-white/20 rounded-xl px-2.5 py-2 flex-shrink-0 min-w-[52px]">
              <span className="text-white text-xl font-bold leading-none">
                {user?.name?.charAt(0)}
              </span>
              <span className="mt-1.5 bg-white/25 rounded-md px-1.5 py-0.5 text-white text-[9px] font-semibold tracking-tight whitespace-nowrap">
                부서관리자
              </span>
            </div>
            {/* 이름 + 전화번호 */}
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight">{user?.name}</p>
              <p className="text-white/75 text-xs mt-1 font-medium">{user?.phone || '-'}</p>
            </div>
          </div>

          {/* 소속 — 태그 방식으로 여러 개 표시 */}
          {myDepts.length > 0 && (
            <div className="bg-white/15 rounded-xl px-3 py-2">
              <p className="text-green-100 text-[10px] font-medium mb-1.5">소속</p>
              <div className="flex flex-wrap gap-1.5">
                {myDepts.map(d => (
                  <span
                    key={d.id}
                    className="bg-white/25 text-white text-xs font-medium px-2.5 py-1 rounded-lg leading-tight"
                  >
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 소속 관리 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3.5 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-800">소속 부서/위원회 관리</p>
            <p className="text-xs text-gray-400 mt-0.5">관리 담당 부서를 직접 추가·변경할 수 있습니다</p>
          </div>
          <div className="p-4 space-y-2">
            {allDepts.map(d => (
              <button key={d.id} onClick={() => toggleDept(d.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                  myDeptIds.includes(d.id)
                    ? 'bg-green-50 border-green-300'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                <span className={`text-sm font-medium ${
                  myDeptIds.includes(d.id) ? 'text-green-700' : 'text-gray-700'
                }`}>{d.name}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  myDeptIds.includes(d.id) ? 'border-[#02AA4B] bg-[#02AA4B]' : 'border-gray-300 bg-white'
                }`}>
                  {myDeptIds.includes(d.id) && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
            <button onClick={saveDepts} disabled={savingDepts}
              className="w-full bg-[#02AA4B] hover:bg-[#029940] text-white py-3 rounded-xl text-sm font-bold mt-1 disabled:opacity-60 transition-colors">
              {savingDepts ? '저장 중...' : '소속 저장'}
            </button>
            {deptMsg && (
              <p className={`text-xs text-center font-medium ${
                deptMsg.includes('저장') ? 'text-green-600' : 'text-red-500'
              }`}>{deptMsg}</p>
            )}
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <button
            onClick={() => setShowPw(!showPw)}
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
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-600">
                  {pwError}
                </div>
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
                { label: '새 비밀번호',       key: 'next',    placeholder: '6자 이상 입력' },
                { label: '새 비밀번호 확인',   key: 'confirm', placeholder: '비밀번호 재입력' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    {f.label} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={(pwForm as any)[f.key]}
                    onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
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
