'use client';

import { useState, useEffect, useCallback } from 'react';

interface Department { id: string; name: string; }
interface UserItem {
  id: string;
  employee_no: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  department: { id: string; name: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: '시스템관리자',
  manager: '상위승인자',
  employee: '신청자',
  driver: '운전기사',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-50 text-purple-700',
  manager: 'bg-blue-50 text-blue-700',
  employee: 'bg-gray-50 text-gray-700',
  driver: 'bg-green-50 text-green-700',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '', phone: '', password: '', department_id: '', role: 'manager' as 'manager' | 'employee',
  });
  const [editForm, setEditForm] = useState({
    name: '', department_id: '', role: '', is_active: true,
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [usersRes, deptsRes] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/departments').then(r => r.json()),
    ]);
    setUsers(usersRes.data || []);
    setDepartments(deptsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openAddModal() {
    setForm({ name: '', phone: '', password: '', department_id: '', role: 'manager' });
    setError('');
    setEditUser(null);
    setShowModal(true);
  }

  function openEditModal(u: UserItem) {
    setEditUser(u);
    setEditForm({ name: u.name, department_id: u.department?.id || '', role: u.role, is_active: u.is_active });
    setError('');
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditUser(null); setError(''); }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('이름을 입력해주세요'); return; }
    if (!form.phone.trim()) { setError('전화번호를 입력해주세요'); return; }
    if (form.password.length < 6) { setError('비밀번호는 최소 6자 이상이어야 합니다'); return; }
    if (!form.department_id) { setError('부서를 선택해주세요'); return; }

    setSubmitting(true);
    const digits = form.phone.replace(/\D/g, '');
    const email = `${digits}@member.local`;

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_no: `EMP${Date.now().toString().slice(-7)}`,
        name: form.name.trim(),
        email,
        phone: form.phone.trim(),
        password: form.password,
        department_id: form.department_id,
        role: form.role,
      }),
    });
    const json = await res.json();
    if (json.error) setError(json.error);
    else { closeModal(); fetchAll(); }
    setSubmitting(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setError('');
    if (!editForm.name.trim()) { setError('이름을 입력해주세요'); return; }
    setSubmitting(true);
    const res = await fetch(`/api/users/${editUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name.trim(),
        department_id: editForm.department_id || null,
        role: editForm.role,
        is_active: editForm.is_active,
      }),
    });
    const json = await res.json();
    if (json.error) setError(json.error);
    else { closeModal(); fetchAll(); }
    setSubmitting(false);
  }

  async function handleToggleActive(u: UserItem) {
    if (!confirm(`"${u.name}" 계정을 ${u.is_active ? '비활성화' : '활성화'}하시겠습니까?`)) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    const json = await res.json();
    if (json.error) alert(json.error);
    else fetchAll();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">사용자 관리</h1>
          <p className="text-gray-400 mt-1 text-sm">총 <span className="font-semibold text-gray-600">{users.length}명</span></p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          사용자 추가
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-14 text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">이름</th>
                <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">전화번호</th>
                <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">부서/위원회</th>
                <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">역할</th>
                <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">상태</th>
                <th className="px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-400 text-sm">사용자가 없습니다</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50/70 transition-colors group ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{u.employee_no}</div>
                  </td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{u.phone || <span className="text-gray-300">-</span>}</td>
                  <td className="px-5 py-4 text-gray-500 text-sm">{u.department?.name || <span className="text-gray-300">-</span>}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role] || 'bg-gray-50 text-gray-700'}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex gap-3 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditModal(u)} className="text-sm text-blue-600 hover:text-blue-700 font-medium">수정</button>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-sm font-medium ${u.is_active ? 'text-gray-400 hover:text-red-600' : 'text-emerald-600 hover:text-emerald-700'}`}
                      >
                        {u.is_active ? '비활성화' : '활성화'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editUser ? '사용자 수정' : '사용자 추가'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={editUser ? handleEdit : handleAdd} className="px-6 pb-6 pt-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">이름 *</label>
                <input
                  value={editUser ? editForm.name : form.name}
                  onChange={e => editUser
                    ? setEditForm(p => ({ ...p, name: e.target.value }))
                    : setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="홍길동"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {!editUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">전화번호 (로그인 ID) *</label>
                    <input
                      value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="010-0000-0000"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">이 번호로 로그인합니다</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">초기 비밀번호 *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="최소 6자 이상"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">부서/위원회 *</label>
                <select
                  value={editUser ? editForm.department_id : form.department_id}
                  onChange={e => editUser
                    ? setEditForm(p => ({ ...p, department_id: e.target.value }))
                    : setForm(p => ({ ...p, department_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">선택하세요</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">역할 *</label>
                <select
                  value={editUser ? editForm.role : form.role}
                  onChange={e => editUser
                    ? setEditForm(p => ({ ...p, role: e.target.value }))
                    : setForm(p => ({ ...p, role: e.target.value as 'manager' | 'employee' }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="manager">상위승인자 (부서장/위원장)</option>
                  <option value="employee">신청자</option>
                </select>
              </div>

              {editUser && (
                <div className="flex items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editForm.is_active}
                    onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">계정 활성화</label>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  취소
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors">
                  {submitting ? '처리 중...' : editUser ? '저장하기' : '추가하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
