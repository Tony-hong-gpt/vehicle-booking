'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: phone, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '로그인에 실패했습니다'); return; }
      const role = data.data?.role;
      if (role === 'admin') {
        await fetch('/api/auth/logout', { method: 'POST' });
        setError('관리자는 관리자 전용 페이지에서 로그인해주세요.');
        return;
      }
      if (role === 'manager') {
        window.location.href = '/m/manager';
      } else if (['committee_secretary', 'committee_vice', 'committee_chair'].includes(role)) {
        window.location.href = '/m/committee';
      } else {
        window.location.href = '/m';
      }
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #f0fdf4 0%, #ffffff 50%, #f7fee7 100%)' }}>

      {/* 배경 장식 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #16a34a, transparent)' }} />
        <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #15803d, transparent)' }} />
        <div className="absolute top-1/3 right-4 w-2 h-2 rounded-full bg-green-300 opacity-40" />
        <div className="absolute bottom-1/3 left-6 w-3 h-3 rounded-full bg-green-200 opacity-40" />
      </div>

      <div className="w-full max-w-sm px-6 relative z-10">

        {/* 방패 로고 */}
        <div className="flex flex-col items-center mb-6">
          <div className="mb-4">
            <svg width="96" height="112" viewBox="0 0 96 112" fill="none" xmlns="http://www.w3.org/2000/svg"
              style={{ filter: 'drop-shadow(0 8px 24px rgba(21,128,61,0.25))' }}>
              {/* 방패 외곽선 (금색) */}
              <path d="M48 4 L88 18 L88 58 Q88 88 48 108 Q8 88 8 58 L8 18 Z"
                fill="url(#shieldGold)" />
              {/* 방패 내부 (진녹색) */}
              <path d="M48 11 L82 23 L82 58 Q82 84 48 102 Q14 84 14 58 L14 23 Z"
                fill="url(#shieldGreen)" />
              {/* 십자가 세로 */}
              <rect x="45" y="24" width="6" height="50" rx="2" fill="url(#crossGold)" />
              {/* 십자가 가로 */}
              <rect x="26" y="44" width="44" height="6" rx="2" fill="url(#crossGold)" />
              {/* R 텍스트 */}
              <text x="22" y="75" fill="white" fontSize="18" fontWeight="800"
                fontFamily="Arial, sans-serif" letterSpacing="-0.5">R</text>
              {/* L 텍스트 */}
              <text x="57" y="75" fill="white" fontSize="18" fontWeight="800"
                fontFamily="Arial, sans-serif" letterSpacing="-0.5">L</text>

              <defs>
                <linearGradient id="shieldGold" x1="8" y1="4" x2="88" y2="108" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="50%" stopColor="#d97706" />
                  <stop offset="100%" stopColor="#92400e" />
                </linearGradient>
                <linearGradient id="shieldGreen" x1="14" y1="11" x2="82" y2="102" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#166534" />
                  <stop offset="100%" stopColor="#052e16" />
                </linearGradient>
                <linearGradient id="crossGold" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* 브랜드명 */}
          <p className="text-xs font-bold tracking-[0.25em] text-amber-600 mb-0.5">
            ROAD MANAGER
          </p>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
            로드매니저
          </h1>
          <p className="text-sm text-gray-500 text-center leading-relaxed">
            스마트한 차량관리, 더 편리한 사역 지원
          </p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-3xl shadow-xl shadow-green-100/80 border border-green-50 p-7">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* 에러 메시지 */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-600 leading-relaxed">{error}</p>
              </div>
            )}

            {/* 전화번호 */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">전화번호</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  placeholder="010-0000-0000 또는 01000000000"
                  className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition bg-gray-50 focus:bg-white placeholder:text-gray-300"
                />
              </div>
            </div>

            {/* 비밀번호 */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-700">비밀번호</label>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="비밀번호를 입력하세요"
                  className="w-full pl-10 pr-11 py-3.5 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition bg-gray-50 focus:bg-white placeholder:text-gray-300"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPw ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl text-white text-sm font-bold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{
                background: loading
                  ? '#6b7280'
                  : 'linear-gradient(135deg, #166534 0%, #15803d 50%, #16a34a 100%)',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(22,101,52,0.35)',
              }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : '로그인'}
            </button>
          </form>

          {/* 계정 만들기 */}
          <div className="mt-5 pt-5 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-400">
              처음 이용하시나요?{' '}
              <Link href="/signup" className="text-green-700 hover:text-green-800 font-bold underline underline-offset-2">
                계정 만들기
              </Link>
            </p>
          </div>
        </div>

        {/* 하단 카피라이트 */}
        <div className="text-center mt-6 space-y-1">
          <p className="text-[11px] text-gray-400 font-medium">
            © 2024 ROAD MANAGER · 대구동신교회
          </p>
          <p className="text-[10px] text-gray-300">차량 사용 신청 관리 시스템</p>
        </div>

      </div>
    </div>
  );
}
