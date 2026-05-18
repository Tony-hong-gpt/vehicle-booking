'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다');
        return;
      }
      if (data.data?.role !== 'admin') {
        setError('관리자 계정이 아닙니다. 일반 로그인 페이지를 이용해주세요.');
        await fetch('/api/auth/logout', { method: 'POST' });
        return;
      }
      window.location.href = '/';
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center shadow-lg mb-4 border border-white/20">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">차량위원회</h1>
          <p className="text-slate-400 mt-1 text-sm">관리자 전용 로그인</p>
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-3xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-sm text-red-400 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-300">전화번호 또는 이메일</label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="010-0000-0000"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-300">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="비밀번호를 입력하세요"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm"
            >
              {loading ? '로그인 중...' : '관리자 로그인'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-slate-500 mt-6">© 차량 사용 신청 관리 시스템</p>
      </div>
    </div>
  );
}
