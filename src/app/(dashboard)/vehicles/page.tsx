'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { FUEL_TYPE_LABELS } from '@/lib/constants';
import * as XLSX from 'xlsx';

interface Vehicle {
  id: string;
  name: string;
  license_plate: string;
  status: string;
  fuel_type: string;
  year?: number;
  capacity?: number;
  current_mileage: number;
  vehicle_group?: { id: string; name: string };
}
interface VehicleGroup { id: string; name: string; }

/* 날짜 선택 시 표시 상태 */
const DATE_STATUS_CONFIG: Record<string, { label: string; color: string; badgeColor: string }> = {
  available:    { label: '사용 가능', color: 'text-green-600',  badgeColor: 'bg-green-100 text-green-700' },
  booked:       { label: '배차완료',  color: 'text-blue-600',   badgeColor: 'bg-blue-100 text-blue-700' },
  in_progress:  { label: '운행 중',   color: 'text-purple-600', badgeColor: 'bg-purple-100 text-purple-700' },
  maintenance:  { label: '정비 중',   color: 'text-orange-600', badgeColor: 'bg-orange-100 text-orange-700' },
  inactive:     { label: '비운행',    color: 'text-gray-400',   badgeColor: 'bg-gray-100 text-gray-500' },
};

/* 날짜 미선택 시: DB status는 stale할 수 있으므로 정비/비운행만 표시.
   그 외(available, in_use)는 배지 없이 보유차량으로 표시 */
const DB_SPECIAL_BADGE: Record<string, { label: string; badgeColor: string }> = {
  maintenance: { label: '정비 중', badgeColor: 'bg-orange-100 text-orange-700' },
  inactive:    { label: '비운행',  badgeColor: 'bg-gray-100 text-gray-500' },
};

const EMPTY_FORM = {
  vehicle_group_id: '', name: '', license_plate: '', model: '',
  year: '', capacity: '', fuel_type: 'gasoline', current_mileage: '0',
};

export default function VehiclesPage() {
  const router = useRouter();
  const [vehicles, setVehicles]     = useState<Vehicle[]>([]);
  const [groups, setGroups]         = useState<VehicleGroup[]>([]);
  const [loading, setLoading]       = useState(true);
  const [userRole, setUserRole]     = useState('');

  /* 날짜 필터 */
  const [filterDate, setFilterDate]       = useState('');
  const [availableIds, setAvailableIds]   = useState<Set<string> | null>(null);
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());
  const [checking, setChecking]           = useState(false);

  /* 상태/그룹 필터 (클라이언트 사이드) */
  const [statusFilter, setStatusFilter] = useState('');
  const [groupFilter, setGroupFilter]   = useState('');

  /* 등록 모달 */
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');

  /* 전체 차량 + 그룹 로드 */
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [vehiclesRes, groupsRes, meRes] = await Promise.all([
      fetch('/api/vehicles?page_size=500').then(r => r.json()),
      fetch('/api/vehicle-groups').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]);
    setVehicles(vehiclesRes.data || []);
    setGroups(groupsRes.data || []);
    setUserRole(meRes.data?.role || '');
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* 날짜 선택 시 가용 차량 조회 */
  const checkDate = useCallback(async (date: string) => {
    if (!date) {
      setAvailableIds(null);
      setInProgressIds(new Set());
      // 날짜 초기화 시 날짜 모드 전용 필터가 남아있으면 제거
      setStatusFilter(prev => ['available', 'booked', 'in_progress'].includes(prev) ? '' : prev);
      return;
    }
    setChecking(true);
    try {
      const start = new Date(`${date}T00:00:00`).toISOString();
      const end   = new Date(`${date}T23:59:59`).toISOString();
      const res   = await fetch(`/api/vehicles/available?start_datetime=${start}&end_datetime=${end}`);
      const json  = await res.json();
      setAvailableIds(new Set((json.data || []).map((v: Vehicle) => v.id)));
      setInProgressIds(new Set((json.in_progress_ids || []) as string[]));
    } catch {
      setAvailableIds(null);
      setInProgressIds(new Set());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { checkDate(filterDate); }, [filterDate, checkDate]);

  /* 날짜 선택 시 표시 상태 결정 */
  function resolveStatus(v: Vehicle): string {
    if (availableIds === null) return v.status; // 날짜 미선택 → DB status
    if (v.status === 'maintenance') return 'maintenance';
    if (v.status === 'inactive') return 'inactive';
    if (availableIds.has(v.id)) return 'available';
    // 배차된 차량 중 in_progress(실제 운행 중) vs scheduled(배차완료/출발 전) 구분
    if (inProgressIds.has(v.id)) return 'in_progress';
    return 'booked';
  }

  /* 필터 적용 */
  const displayed = vehicles
    .map(v => ({ ...v, displayStatus: resolveStatus(v) }))
    .filter(v => {
      if (groupFilter && v.vehicle_group?.id !== groupFilter) return false;
      if (statusFilter && v.displayStatus !== statusFilter) return false;
      return true;
    });

  /* 요약 카운트 (날짜 선택 시에만 사용) */
  const allResolved = vehicles
    .filter(v => !groupFilter || v.vehicle_group?.id === groupFilter)
    .map(v => resolveStatus(v));

  const counts = {
    available:   allResolved.filter(s => s === 'available').length,
    booked:      allResolved.filter(s => s === 'booked').length,
    in_progress: allResolved.filter(s => s === 'in_progress').length,
    maintenance: allResolved.filter(s => s === 'maintenance').length,
    inactive:    allResolved.filter(s => s === 'inactive').length,
  };

  const isAdmin = userRole === 'admin';
  const today = format(new Date(), 'yyyy-MM-dd');

  /* Excel import 상태 */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importError, setImportError] = useState('');

  /* 상태 필터 옵션
     - 날짜 선택 시: 실제 배차 현황 기준 필터
     - 날짜 미선택 시: 정비중/비운행만 필터 가능 (DB 가용 상태는 신뢰 불가) */
  const statusOptions = availableIds !== null ? [
    { value: '', label: '전체' },
    { value: 'available',   label: `사용 가능 (${counts.available})` },
    { value: 'in_progress', label: `운행 중 (${counts.in_progress})` },
    { value: 'booked',      label: `배차완료 (${counts.booked})` },
    { value: 'maintenance', label: `정비 중 (${counts.maintenance})` },
  ] : [
    { value: '', label: '전체' },
    { value: 'maintenance', label: '정비 중' },
    { value: 'inactive',    label: '비운행' },
  ];

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 차량을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) alert(json.error);
    else fetchData();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(''); setSubmitting(true);
    const body: Record<string, unknown> = {
      vehicle_group_id: form.vehicle_group_id, name: form.name,
      license_plate: form.license_plate, fuel_type: form.fuel_type,
      current_mileage: Number(form.current_mileage) || 0,
    };
    if (form.model) body.model = form.model;
    if (form.year) body.year = Number(form.year);
    if (form.capacity) body.capacity = Number(form.capacity);
    const res = await fetch('/api/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) setFormError(json.error);
    else { setShowModal(false); setForm(EMPTY_FORM); fetchData(); }
    setSubmitting(false);
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['차량군명', '차량명', '차량번호', '모델명', '연식', '정원(명)', '연료', '현재주행거리(km)'],
      ['일반차량', '현대 소나타', '서울00가0000', '소나타 DN8', 2023, 5, '가솔린', 50000],
    ]);
    ws['A1'] = { v: '차량군명', t: 's' };
    ws['G1'] = { v: '연료 (가솔린/디젤/전기/하이브리드 중 하나)', t: 's' };
    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 8 }, { wch: 10 }, { wch: 30 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '차량입력양식');
    XLSX.writeFile(wb, '차량_입력양식.xlsx');
  }

  function downloadData() {
    const t = new Date();
    const dateStr = `${t.getFullYear()}${String(t.getMonth()+1).padStart(2,'0')}${String(t.getDate()).padStart(2,'0')}`;
    const STATUS_LABELS: Record<string, string> = {
      available: '사용가능', in_use: '사용중', maintenance: '정비중', inactive: '비운행',
    };
    const rows = vehicles.map(v => ({
      차량군: v.vehicle_group?.name || '',
      차량명: v.name,
      차량번호: v.license_plate,
      모델명: (v as any).model || '',
      연식: v.year || '',
      정원: v.capacity || '',
      연료: FUEL_TYPE_LABELS[v.fuel_type] || v.fuel_type,
      '현재주행거리(km)': v.current_mileage,
      상태: STATUS_LABELS[v.status] || v.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '차량목록');
    XLSX.writeFile(wb, `차량목록_${dateStr}.xlsx`);
  }

  function handleVehicleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const FUEL_KO_MAP: Record<string, string> = {
      가솔린: 'gasoline', 디젤: 'diesel', 전기: 'electric', 하이브리드: 'hybrid',
    };
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws);
        const errors: string[] = [];
        const parsed = rows
          .filter(r => r['차량명']?.toString().trim())
          .map((r, i) => {
            const groupName = (r['차량군명'] || '').toString().trim();
            const group = groups.find(g => g.name === groupName);
            if (!group) errors.push(`${i+1}행: 차량군 "${groupName}"을 찾을 수 없습니다`);
            const fuelKo = (r['연료'] || '').toString().trim();
            return {
              name: (r['차량명'] || '').toString().trim(),
              license_plate: (r['차량번호'] || '').toString().trim(),
              vehicle_group_id: group?.id || '',
              group_name: groupName,
              model: (r['모델명'] || '').toString().trim(),
              year: r['연식'] ? Number(r['연식']) : undefined,
              capacity: r['정원(명)'] ? Number(r['정원(명)']) : undefined,
              fuel_type: FUEL_KO_MAP[fuelKo] || 'gasoline',
              current_mileage: r['현재주행거리(km)'] ? Number(r['현재주행거리(km)']) : 0,
            };
          });
        if (errors.length > 0) {
          setImportError(errors.join(', '));
          return;
        }
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

  async function handleVehicleImport() {
    if (importPreview.length === 0) return;
    setImporting(true);
    setImportError('');
    let successCount = 0;
    let failCount = 0;
    for (const v of importPreview) {
      const body: Record<string, unknown> = {
        vehicle_group_id: v.vehicle_group_id,
        name: v.name,
        license_plate: v.license_plate,
        fuel_type: v.fuel_type,
        current_mileage: v.current_mileage,
      };
      if (v.model) body.model = v.model;
      if (v.year) body.year = v.year;
      if (v.capacity) body.capacity = v.capacity;
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) successCount++;
      else failCount++;
    }
    setImportPreview([]);
    setImporting(false);
    fetchData();
    if (failCount > 0) setImportError(`${successCount}개 등록 완료, ${failCount}개 실패 (차량번호 중복 등)`);
  }

  return (
    <div className="p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">차량 현황</h1>
          <p className="text-gray-500 mt-1 text-sm">총 {vehicles.length}대</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={downloadTemplate}
              className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors">
              ↓ 양식
            </button>
            <button onClick={downloadData}
              className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors">
              ↓ 목록
            </button>
            <button onClick={() => { setShowModal(true); setFormError(''); setForm(EMPTY_FORM); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              <span className="text-lg leading-none">+</span> 차량 등록
            </button>
          </div>
        )}
      </div>

      {/* 날짜 선택 바 */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-4 mb-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            날짜별 가용 확인
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={e => { setFilterDate(e.target.value); setStatusFilter(''); }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={() => today !== filterDate && setFilterDate(today)}
            className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
              filterDate === today ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}>오늘</button>
          {filterDate && (
            <button onClick={() => { setFilterDate(''); setStatusFilter(''); setAvailableIds(null); }}
              className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50">
              초기화
            </button>
          )}
          {checking && <span className="text-xs text-blue-500 animate-pulse">확인 중...</span>}
          {filterDate && !checking && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              {filterDate} 기준 배차 현황
            </span>
          )}
          {!filterDate && (
            <span className="text-xs text-gray-400">날짜 미선택 시 현재 DB 상태를 표시합니다</span>
          )}
        </div>

        {/* 요약 카운트 (날짜 선택 시) */}
        {availableIds !== null && !checking && (
          <div className="flex gap-3 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            {[
              { label: '사용 가능', count: counts.available,    color: 'text-green-600',  bg: 'bg-green-50' },
              { label: '운행 중',   count: counts.in_progress,  color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: '배차완료',  count: counts.booked,       color: 'text-blue-600',   bg: 'bg-blue-50' },
              { label: '정비 중',   count: counts.maintenance,  color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-lg px-4 py-2 flex items-center gap-2`}>
                <span className={`text-lg font-bold ${s.color}`}>{s.count}</span>
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
            ))}
            <div className="text-xs text-gray-400 flex items-center ml-auto">
              전체 {vehicles.filter(v => v.status !== 'inactive').length}대 기준
            </div>
          </div>
        )}
      </div>

      {/* 필터 바 */}
      <div className="flex items-center gap-2 mb-6 bg-white border border-gray-200 rounded-2xl p-2 w-fit shadow-sm">
        {/* 상태 */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold text-gray-700 px-2 tracking-wide">상태</span>
          {statusOptions.map(opt => (
            <button key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === opt.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {groups.length > 0 && <div className="w-px h-6 bg-gray-200 mx-1" />}

        {/* 차량군 */}
        {groups.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-gray-700 px-2 tracking-wide">차량군</span>
            <button onClick={() => setGroupFilter('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                !groupFilter ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}>전체</button>
            {groups.map(g => (
              <button key={g.id} onClick={() => setGroupFilter(g.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  groupFilter === g.id ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                }`}>{g.name}</button>
            ))}
          </div>
        )}
      </div>

      {/* Excel 일괄 등록 (관리자만) */}
      {isAdmin && (
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
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleVehicleFileChange} className="hidden" />
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
                {importPreview.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">{v.group_name}</span>
                    <span className="font-medium text-gray-800">{v.name}</span>
                    <span className="text-xs text-gray-400 font-mono">{v.license_plate}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleVehicleImport}
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
      )}

      {/* 차량 카드 그리드 */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">불러오는 중...</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {displayed.length === 0 && (
            <div className="col-span-3 py-16 text-center text-gray-400">
              {statusFilter ? '해당 상태의 차량이 없습니다' : '차량이 없습니다'}
            </div>
          )}
          {displayed.map(v => {
            const ds = v.displayStatus;
            // 날짜 선택 시: 실제 배차 현황 배지 / 날짜 미선택 시: 정비중·비운행만 배지, 나머지는 배지 없음
            const dateBadge = availableIds !== null
              ? (DATE_STATUS_CONFIG[ds] || DATE_STATUS_CONFIG.inactive)
              : null;
            const specialBadge = availableIds === null ? DB_SPECIAL_BADGE[ds] : null;
            return (
              <div key={v.id}
                onClick={() => router.push(`/vehicles/${v.id}`)}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{v.name}</h3>
                    <p className="text-sm text-gray-400 font-mono">{v.license_plate}</p>
                  </div>
                  {dateBadge && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${dateBadge.badgeColor}`}>
                      {dateBadge.label}
                    </span>
                  )}
                  {specialBadge && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${specialBadge.badgeColor}`}>
                      {specialBadge.label}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">차량군</span>
                    <span className="text-gray-700">{v.vehicle_group?.name}</span>
                  </div>
                  {v.year && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">연식</span>
                      <span className="text-gray-700">{v.year}년</span>
                    </div>
                  )}
                  {v.capacity && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">정원</span>
                      <span className="text-gray-700">{v.capacity}명</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">연료</span>
                    <span className="text-gray-700">{FUEL_TYPE_LABELS[v.fuel_type]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">주행거리</span>
                    <span className="text-gray-700">{v.current_mileage.toLocaleString()}km</span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <button onClick={e => { e.stopPropagation(); handleDelete(v.id, v.name); }}
                      className="w-full text-xs text-red-500 hover:text-red-700 hover:bg-red-50 py-1.5 rounded-lg transition-colors">
                      차량 삭제
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 차량 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">차량 등록</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">차량군 <span className="text-red-500">*</span></label>
                  <select name="vehicle_group_id" value={form.vehicle_group_id}
                    onChange={e => setForm(p => ({ ...p, vehicle_group_id: e.target.value }))} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">선택하세요</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                {[
                  { label: '차량명', key: 'name', required: true, placeholder: '예: 기아 K5' },
                  { label: '차량번호', key: 'license_plate', required: true, placeholder: '예: 서울12가3456' },
                  { label: '모델명', key: 'model', placeholder: '예: K5 2.0 LPi' },
                  { label: '연식', key: 'year', type: 'number', placeholder: '예: 2022' },
                  { label: '정원 (명)', key: 'capacity', type: 'number', placeholder: '예: 5' },
                  { label: '현재 주행거리 (km)', key: 'current_mileage', type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                    </label>
                    <input type={f.type || 'text'} required={f.required}
                      value={(form as any)[f.key]} placeholder={f.placeholder}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">연료 <span className="text-red-500">*</span></label>
                  <select value={form.fuel_type} onChange={e => setForm(p => ({ ...p, fuel_type: e.target.value }))} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="gasoline">가솔린</option>
                    <option value="diesel">디젤</option>
                    <option value="electric">전기</option>
                    <option value="hybrid">하이브리드</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">취소</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
                  {submitting ? '등록 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
