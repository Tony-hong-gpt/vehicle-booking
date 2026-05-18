'use client';

import { useState, useEffect, useCallback } from 'react';

interface VehicleGroup {
  id: string;
  name: string;
  created_at: string;
}

export default function VehicleGroupsPage() {
  const [groups, setGroups] = useState<VehicleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/vehicle-groups');
    const json = await res.json();
    setGroups(json.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError('');

    const res = await fetch('/api/vehicle-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const json = await res.json();

    if (json.error) {
      setError(json.error);
    } else {
      setNewName('');
      fetchGroups();
    }
    setAdding(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 차량군을 삭제하시겠습니까?\n해당 차량군에 등록된 차량이 없을 때만 삭제 가능합니다.`)) return;

    const res = await fetch(`/api/vehicle-groups/${id}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.error) {
      alert(json.error);
    } else {
      fetchGroups();
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">차량군 관리</h1>
        <p className="text-sm text-gray-400 mt-1">차량을 분류하는 차량군을 관리합니다 (예: 일반차량, 승합차량, 화물차량)</p>
      </div>

      {/* 등록 폼 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">새 차량군 추가</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="차량군명 입력 (예: 전기차량)"
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
          <h2 className="text-sm font-bold text-gray-700">등록된 차량군</h2>
          <span className="text-xs text-gray-400 font-medium">총 {groups.length}건</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">등록된 차량군이 없습니다</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {groups.map(group => (
              <li key={group.id} className="flex items-center justify-between px-5 py-4 group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">{group.name}</span>
                </div>
                <button
                  onClick={() => handleDelete(group.id, group.name)}
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
