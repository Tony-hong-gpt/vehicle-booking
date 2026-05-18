'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Department { id: string; name: string; }

export default function SignupPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    password: '',
    passwordConfirm: '',
    department_id: '',
  });

  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then(json => setDepartments(json.data || []));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) { setError('이름을 입력해주세요'); return; }
    if (!form.phone.trim()) { setError('전화번호를 입력해주세요'); return; }
    if (form.password.length < 6) { setError('비밀번호는 최소 6자 이상이어야 합니다'); return; }
    if (form.password !== form.passwordConfirm) { setError('비밀번호가 일치하지 않습니다'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          password: form.password,
          department_id: form.department_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '가입에 실패했습니다');
        return;
      }
      setSuccess(true);
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">가입 완료!</h2>
          <p className="text-gray-500 text-sm mb-6">
            전화번호와 비밀번호로 로그인하세요.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            로그인 하러 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-10">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">차량 사용 신청</h1>
            <p className="text-gray-500 mt-1 text-sm">신청자 계정 만들기</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">이름 *</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="홍길동"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">전화번호 *</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="010-0000-0000"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">이 번호가 로그인 ID로 사용됩니다</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">부서/위원회</label>
              <select
                name="department_id"
                value={form.department_id}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택하세요</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">대표 부서 하나를 선택하세요. 부서는 로그인 후 추가하실 수 있습니다.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비밀번호 *</label>
              <input
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                placeholder="최소 6자 이상"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">영문, 숫자, 특수문자 조합 6자 이상</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">비밀번호 확인 *</label>
              <input
                name="passwordConfirm"
                type="password"
                value={form.passwordConfirm}
                onChange={handleChange}
                placeholder="비밀번호를 다시 입력하세요"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition disabled:opacity-60 text-sm mt-2"
            >
              {loading ? '가입 중...' : '가입하기'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              로그인
            </Link>
          </p>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">차량 사용 신청 관리 시스템 v1.0</p>
      </div>
    </div>
  );
}
