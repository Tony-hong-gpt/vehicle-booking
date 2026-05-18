'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

interface Department { id: string; name: string; }
interface UserItem {
  id: string;
  employee_no: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  department_id: string | null;
  department_ids: string[];
  department?: { id: string; name: string } | null;
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

  /* Excel import 상태 */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importError, setImportError] = useState('');

  const [form, setForm] = useState({
    name: '', phone: '', password: '', department_id: '', role: 'manager' as 'manager' | 'employee',
  });
  const [editForm, setEditForm] = useState({
    name: '', department_ids: [] as string[], role: '', is_active: true,
  });
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [usersRes, deptsRes] = await Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/departments').then(r => r.json()),
    ]);
    const depts: Department[] = deptsRes.data || [];
    const rawUsers: UserItem[] = usersRes.data || [];
    const merged = rawUsers.map(u => ({
      ...u,
      department_ids: u.department_ids || [],
      departments: (u.department_ids || []).map((did: string) => depts.find(d => d.id === did)).filter(Boolean),
    }));
    setUsers(merged);
    setDepartments(depts);
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
    setEditForm({ name: u.name, department_ids: u.department_ids || [], role: u.role, is_active: u.is_active });
    setDeptDropdownOpen(false);
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
        department_ids: editForm.department_ids,
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

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['이름', '전화번호', '부서/위원회명', '역할', '초기비밀번호'],
      ['홍길동', '010-0000-0000', '예배위원회', '상위승인자 (또는 신청자)', 'pass1234'],
    ]);
    ws['D1'] = { v: '역할 (상위승인자 또는 신청자)', t: 's' };
    ws['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 28 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '사용자입력양식');
    XLSX.writeFile(wb, '사용자_입력양식.xlsx');
  }

  function downloadData() {
    const t = new Date();
    const dateStr = `${t.getFullYear()}${String(t.getMonth()+1).padStart(2,'0')}${String(t.getDate()).padStart(2,'0')}`;
    const rows = users.map(u => ({
      이름: u.name,
      전화번호: u.phone || '',
      '부서/위원회': u.department?.name || '',
      역할: ROLE_LABELS[u.role] || u.role,
      상태: u.is_active ? '활성' : '비활성',
      사번: u.employee_no,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '사용자목록');
    XLSX.writeFile(wb, `사용자목록_${dateStr}.xlsx`);
  }

  function handleUserFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const ROLE_KO_MAP: Record<string, string> = {
      상위승인자: 'manager', 신청자: 'employee',
    };
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws);
        const parsed = rows
          .filter(r => r['이름']?.toString().trim())
          .map(r => {
            const deptName = (r['부서/위원회명'] || '').toString().trim();
            const dept = departments.find(d => d.name === deptName);
            const phone = (r['전화번호'] || '').toString().trim();
            const digits = phone.replace(/\D/g, '');
            const roleKo = (r['역할'] || '').toString().trim();
            return {
              name: (r['이름'] || '').toString().trim(),
              phone,
              email: digits ? `${digits}@member.local` : '',
              department_id: dept?.id || null,
              department_name: deptName,
              role: ROLE_KO_MAP[roleKo] || 'employee',
              role_label: roleKo,
              password: (r['초기비밀번호'] || '').toString().trim(),
            };
          });
        if (parsed.length === 0) {
          setImportError('데이터가 없습니다. 양식을 확인해주세요.');
          return;
        }
        setImportPreview(parsed);
      } catch {
        setImportError('파일을 읽을 수 없습니다. Excel 파일(.xlsx)인지 확인해주세요.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  async function handleUserImport() {
    if (importPreview.length === 0) return;
    setImporting(true);
    setImportError('');
    let successCount = 0;
    let failCount = 0;
    for (const u of importPreview) {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_no: `EMP${Date.now().toString().slice(-7)}`,
          name: u.name,
          email: u.email,
          phone: u.phone,
          password: u.password,
          department_id: u.department_id,
          role: u.role,
        }),
      });
      if (res.ok) successCount++;
      else failCount++;
    }
    setImportPreview([]);
    setImporting(false);
    fetchAll();
    if (failCount > 0) setImportError(`${successCount}개 등록 완료, ${failCount}개 실패 (중복 등)`);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">사용자 관리</h1>
          <p className="text-gray-400 mt-1 text-sm">총 <span className="font-semibold text-gray-600">{users.length}명</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadTemplate}
            className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            ↓ 양식
          </button>
          <button
            onClick={downloadData}
            className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            ↓ 목록
          </button>
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
      </div>

      {/* Excel 일괄 등록 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Excel 일괄 등록</h2>
          <button
            onClick={downloadTemplate}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            ↓ 양식 다운로드
          </button>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleUserFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-center"
          >
            📂 Excel 파일 선택 (.xlsx)
          </button>
        </div>
        {importError && <p className="text-red-500 text-xs mt-2">{importError}</p>}

        {importPreview.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">아래 {importPreview.length}명을 등록합니다:</p>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {importPreview.map((u, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800">{u.name}</span>
                  <span className="text-xs text-gray-400">{u.phone}</span>
                  {u.department_name && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{u.department_name}</span>
                  )}
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{u.role_label || ROLE_LABELS[u.role]}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleUserImport}
                disabled={importing}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {importing ? '등록 중...' : `${importPreview.length}명 등록하기`}
              </button>
              <button
                onClick={() => setImportPreview([])}
                className="px-4 py-2 border border-gray-200 text-sm text-gray-500 rounded-xl hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}
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
                  <td className="px-5 py-4">
                    {u.department_ids?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {u.department_ids.map((did: string) => {
                          const d = departments.find(x => x.id === did);
                          return d ? (
                            <span key={did} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{d.name}</span>
                          ) : null;
                        })}
                      </div>
                    ) : <span className="text-gray-300 text-sm">-</span>}
                  </td>
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
                {editUser ? (
                  /* 편집: 멀티셀렉트 태그 UI */
                  <div className="border border-gray-300 rounded-lg p-2 min-h-[42px] relative">
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {editForm.department_ids.map(did => {
                        const d = departments.find(x => x.id === did);
                        return d ? (
                          <span key={did} className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {d.name}
                            <button type="button" onClick={() => setEditForm(p => ({ ...p, department_ids: p.department_ids.filter(x => x !== did) }))}
                              className="text-blue-500 hover:text-blue-700 ml-0.5 leading-none">×</button>
                          </span>
                        ) : null;
                      })}
                      <div className="relative">
                        <button type="button"
                          onClick={() => setDeptDropdownOpen(p => !p)}
                          className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 rounded-full text-xs transition-colors">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                          추가
                        </button>
                        {deptDropdownOpen && (
                          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px] max-h-48 overflow-y-auto">
                            {departments.filter(d => !editForm.department_ids.includes(d.id)).length === 0 ? (
                              <p className="px-3 py-2 text-xs text-gray-400">모두 선택됨</p>
                            ) : departments.filter(d => !editForm.department_ids.includes(d.id)).map(d => (
                              <button key={d.id} type="button"
                                onClick={() => { setEditForm(p => ({ ...p, department_ids: [...p.department_ids, d.id] })); setDeptDropdownOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors">
                                {d.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 추가: 단일 선택 드롭다운 */
                  <select
                    value={form.department_id}
                    onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">선택하세요</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
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
