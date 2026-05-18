'use client';

import { useState, useEffect, useCallback } from 'react';

interface Department {
  id: string;
  name: string;
  code: string | null;
  created_at: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 추가 폼
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [adding, setAdding] = useState(false);

  // 수정 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/departments');
    const json = await res.json();
    setDepartments(json.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError('');
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), code: newCode.trim() || null }),
    });
    const json = await res.json();
    if (json.error) {
      setError(json.error);
    } else {
      setNewName('');
      setNewCode('');
      fetchDepartments();
    }
    setAdding(false);
  }

  function startEdit(dept: Department) {
    setEditingId(dept.id);
    setEditName(dept.name);
    setEditCode(dept.code || '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditCode('');
  }

  async function handleSave(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/departments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), code: editCode.trim() || null }),
    });
    const json = await res.json();
    if (json.error) {
      alert(json.error);
    } else {
      cancelEdit();
      fetchDepartments();
    }
    setSaving(false);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 부서를 삭제하시겠습니까?\n소속 사용자가 있으면 삭제되지 않습니다.`)) return;
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) alert(json.error);
    else fetchDepartments();
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">부서/위원회 관리</h1>
        <p className="text-sm text-gray-400 mt-1">신청자와 상위승인자를 연결하는 부서(위원회)를 관리합니다</p>
      </div>

      {/* 추가 폼 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">새 부서/위원회 추가</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="부서명 (예: 선교위원회)"
            className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
            maxLength={50}
          />
          <input
            type="text"
            value={newCode}
            onChange={e => setNewCode(e.target.value.toUpperCase())}
            placeholder="코드"
            className="w-24 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-gray-50 focus:bg-white"
            maxLength={10}
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {adding ? '추가 중...' : '추가'}
          </button>
        </form>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">등록된 부서/위원회</h2>
          <span className="text-xs text-gray-400 font-medium">총 {departments.length}개</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>
        ) : departments.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">등록된 부서가 없습니다</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {departments.map(dept => (
              <li key={dept.id} className="px-5 py-4">
                {editingId === dept.id ? (
                  <div className="flex gap-2 items-center">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 border border-blue-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      maxLength={50}
                    />
                    <input
                      value={editCode}
                      onChange={e => setEditCode(e.target.value.toUpperCase())}
                      className="w-24 border border-blue-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      maxLength={10}
                      placeholder="코드"
                    />
                    <button
                      onClick={() => handleSave(dept.id)}
                      disabled={saving || !editName.trim()}
                      className="px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3.5 py-2 text-gray-500 text-xs hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                      <span className="text-sm font-semibold text-gray-800">{dept.name}</span>
                      {dept.code && (
                        <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded-lg">
                          {dept.code}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(dept)}
                        className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(dept.id, dept.name)}
                        className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
