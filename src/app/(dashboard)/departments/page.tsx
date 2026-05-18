'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';

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

  // Excel 업로드 상태
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{name: string; code: string}[]>([]);
  const [importError, setImportError] = useState('');

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

  function downloadData() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    const rows = departments.map(d => ({
      부서명: d.name,
      코드: d.code || '',
      등록일: d.created_at ? new Date(d.created_at).toLocaleDateString('ko-KR') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '부서목록');
    XLSX.writeFile(wb, `부서_위원회_목록_${dateStr}.xlsx`);
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['부서명', '코드'],
      ['예시: 선교위원회', 'MIS'],
      ['예시: 교육위원회', 'EDU'],
    ]);
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '부서목록');
    XLSX.writeFile(wb, '부서_위원회_입력양식.xlsx');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<{부서명: string; 코드?: string}>(ws);
        const parsed = rows
          .filter(r => r['부서명']?.toString().trim())
          .map(r => ({
            name: r['부서명'].toString().trim(),
            code: (r['코드'] || '').toString().trim().toUpperCase(),
          }));
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

  async function handleImport() {
    if (importPreview.length === 0) return;
    setImporting(true);
    setImportError('');
    let successCount = 0;
    let failCount = 0;
    for (const dept of importPreview) {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: dept.name, code: dept.code || null }),
      });
      if (res.ok) successCount++;
      else failCount++;
    }
    setImportPreview([]);
    setImporting(false);
    fetchDepartments();
    if (failCount > 0) setImportError(`${successCount}개 등록 완료, ${failCount}개 실패 (코드 중복 등)`);
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
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">부서/위원회 관리</h1>
          <p className="text-sm text-gray-400 mt-1">신청자와 상위승인자를 연결하는 부서(위원회)를 관리합니다</p>
        </div>
        <button
          onClick={downloadData}
          className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          ↓ 목록 다운로드
        </button>
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
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
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
            <p className="text-xs text-gray-500 mb-2">아래 {importPreview.length}개 항목을 등록합니다:</p>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {importPreview.map((d, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800">{d.name}</span>
                  {d.code && <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">{d.code}</span>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {importing ? '등록 중...' : `${importPreview.length}개 등록하기`}
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
