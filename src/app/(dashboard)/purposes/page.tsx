'use client';

import { useState, useEffect, useCallback } from 'react';

interface Purpose {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function PurposesPage() {
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const fetchPurposes = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/purposes');
    const json = await res.json();
    setPurposes(json.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPurposes();
  }, [fetchPurposes]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError('');

    const res = await fetch('/api/purposes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();

    if (json.error) {
      setError(json.error);
    } else {
      setNewName('');
      fetchPurposes();
    }
    setAdding(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 목적을 삭제하시겠습니까?`)) return;

    const res = await fetch(`/api/purposes/${id}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.error) {
      alert(json.error);
    } else {
      fetchPurposes();
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">사용목적 관리</h1>
        <p className="text-sm text-gray-400 mt-1">차량 신청 시 선택할 수 있는 사용목적을 관리합니다</p>
      </div>

      {/* 등록 폼 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">새 목적 추가</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="사용목적명 입력"
            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
            maxLength={50}
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {adding ? '추가 중...' : '추가'}
          </button>
        </form>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">등록된 사용목적</h2>
          <span className="text-xs text-gray-400 font-medium">총 {purposes.length}건</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>
        ) : purposes.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">등록된 사용목적이 없습니다</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {purposes.map(purpose => (
              <li key={purpose.id} className="flex items-center justify-between px-5 py-4 group">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                  <span className="text-sm font-semibold text-gray-800">{purpose.name}</span>
                </div>
                <button
                  onClick={() => handleDelete(purpose.id, purpose.name)}
                  className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium opacity-0 group-hover:opacity-100"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
