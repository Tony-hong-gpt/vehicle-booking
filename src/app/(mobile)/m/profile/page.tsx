'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Department { id: string; name: string; }

export default function MobileProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [myDeptIds, setMyDeptIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDepts, setSavingDepts] = useState(false);
  const [deptMsg, setDeptMsg] = useState('');

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

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
    setMyDeptIds(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  }

  async function saveDepts() {
    setSavingDepts(true);
    setDeptMsg('');
    const res = await fetch('/api/user-departments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_ids: myDeptIds }),
    });
    const json = await res.json();
    setDeptMsg(json.error ? json.error : '소속이 저장되었습니다');
    setSavingDepts(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwMsg('');
    if (pwForm.next.length < 6) { setPwError('새 비밀번호는 최소 6자 이상이어야 합니다'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('새 비밀번호가 일치하지 않습니다'); return; }

    setPwLoading(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
    });
    const json = await res.json();
    if (json.error) setPwError(json.error);
    else { setPwMsg('비밀번호가 변경되었습니다'); setPwForm({ current: '', next: '', confirm: '' }); }
    setPwLoading(false);
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">불러오는 중...</div>
  );

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">내 정보</h1>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* 프로필 카드 */}
        <div className="bg-blue-600 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <p className="text-white font-bold text-lg">{user?.name}</p>
            <p className="text-blue-200 text-sm">{user?.phone}</p>
          </div>
        </div>

        {/* 소속 관리 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">소속 부서/위원회</p>
            <p className="text-xs text-gray-400 mt-0.5">차량 신청 시 매칭될 소속을 선택하세요</p>
          </div>
          <div className="p-4 space-y-2">
            {allDepts.map(d => (
              <button key={d.id} onClick={() => toggleDept(d.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                  myDeptIds.includes(d.id) ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'
                }`}>
                <span className={`text-sm font-medium ${myDeptIds.includes(d.id) ? 'text-blue-700' : 'text-gray-700'}`}>
                  {d.name}
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  myDeptIds.includes(d.id) ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
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
              className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold mt-2 disabled:opacity-60">
              {savingDepts ? '저장 중...' : '소속 저장'}
            </button>
            {deptMsg && <p className={`text-xs text-center ${deptMsg.includes('저장') ? 'text-green-600' : 'text-red-500'}`}>{deptMsg}</p>}
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">비밀번호 변경</p>
          </div>
          <form onSubmit={changePassword} className="p-4 space-y-3">
            <input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
              placeholder="현재 비밀번호"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
              placeholder="새 비밀번호 (최소 6자)"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
              placeholder="새 비밀번호 확인"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {pwError && <p className="text-xs text-red-500">{pwError}</p>}
            {pwMsg && <p className="text-xs text-green-600">{pwMsg}</p>}
            <button type="submit" disabled={pwLoading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-60">
              {pwLoading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        </div>

        {/* 로그아웃 */}
        <button onClick={handleLogout}
          className="w-full border border-gray-200 text-gray-500 py-3.5 rounded-2xl text-sm font-medium">
          로그아웃
        </button>
      </div>
    </div>
  );
}
