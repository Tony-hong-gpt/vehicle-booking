'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FUEL_TYPE_LABELS } from '@/lib/constants';
import * as XLSX from 'xlsx';
import { vehicleName } from '@/lib/vehicle-utils';

interface Vehicle {
  id: string;
  name: string;
  license_plate: string;
  status: string;
  fuel_type: string;
  model?: string;
  year?: number;
  capacity?: number;
  current_mileage: number;
  vehicle_group?: { id: string; name: string };
}
interface VehicleGroup { id: string; name: string; }

/* 날짜 선택 시 계산 상태 */
const DATE_STATUS: Record<string, { label: string; badgeColor: string; dot: string }> = {
  available:   { label: '사용 가능', badgeColor: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  booked:      { label: '배차 완료', badgeColor: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  in_progress: { label: '운행 중',   badgeColor: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  maintenance: { label: '정비 중',   badgeColor: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  inactive:    { label: '비활성',    badgeColor: 'bg-gray-100 text-gray-500',     dot: 'bg-gray-300' },
};

/* DB 상태 (날짜 미선택 시) */
const DB_STATUS: Record<string, { label: string; badgeColor: string }> = {
  available:   { label: '사용가능', badgeColor: 'bg-green-100 text-green-700' },
  in_use:      { label: '운행중',   badgeColor: 'bg-blue-100 text-blue-700' },
  maintenance: { label: '정비중',   badgeColor: 'bg-yellow-100 text-yellow-700' },
  inactive:    { label: '비활성',   badgeColor: 'bg-gray-100 text-gray-500' },
};

const STATUS_ACTIONS: Record<string, { label: string; next: string; color: string }[]> = {
  available:   [
    { label: '정비 처리', next: 'maintenance', color: 'text-yellow-600 hover:bg-yellow-50' },
    { label: '비활성화',  next: 'inactive',    color: 'text-gray-500 hover:bg-gray-50' },
  ],
  maintenance: [
    { label: '정비 완료', next: 'available', color: 'text-green-600 hover:bg-green-50' },
    { label: '비활성화',  next: 'inactive',  color: 'text-gray-500 hover:bg-gray-50' },
  ],
  inactive: [{ label: '복구', next: 'available', color: 'text-blue-600 hover:bg-blue-50' }],
  in_use: [],
};

const EMPTY_FORM = {
  vehicle_group_id: '', name: '', license_plate: '', model: '',
  year: '', capacity: '', fuel_type: 'gasoline', current_mileage: '0',
};

type VehicleForm = typeof EMPTY_FORM;

export default function VehicleManagementPage() {
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [groups, setGroups]           = useState<VehicleGroup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  /* 날짜 필터 */
  const [filterDate, setFilterDate]           = useState('');
  const [availableIds, setAvailableIds]       = useState<Set<string> | null>(null);
  const [inProgressIds, setInProgressIds]     = useState<Set<string>>(new Set());
  const [bookedIds, setBookedIds]             = useState<Set<string>>(new Set());
  const [mileageDateMap, setMileageDateMap]   = useState<Record<string, number>>({});
  const [checking, setChecking]               = useState(false);

  /* 등록 모달 */
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState<VehicleForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');

  /* Excel import 상태 */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting]       = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importError, setImportError]   = useState('');

  /* 수정 모달 */
  const [editVehicle, setEditVehicle]   = useState<Vehicle | null>(null);
  const [editForm, setEditForm]         = useState<VehicleForm>(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError]       = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, groupsRes] = await Promise.all([
        fetch('/api/vehicles?page_size=200').then(r => r.json()),
        fetch('/api/vehicle-groups').then(r => r.json()),
      ]);
      setAllVehicles(vehiclesRes.data ?? []);
      setGroups(groupsRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* 날짜 선택 시 배차 현황 + 주행거리 조회 */
  const checkDate = useCallback(async (date: string) => {
    if (!date) {
      setAvailableIds(null);
      setInProgressIds(new Set());
      setBookedIds(new Set());
      setMileageDateMap({});
      setFilterStatus('');
      return;
    }
    setChecking(true);
    try {
      const start = new Date(`${date}T00:00:00`).toISOString();
      const end   = new Date(`${date}T23:59:59`).toISOString();
      const [availRes, mileageRes] = await Promise.all([
        fetch(`/api/vehicles/available?start_datetime=${start}&end_datetime=${end}`),
        fetch(`/api/vehicles/mileage-history?date=${date}`),
      ]);
      const [availJson, mileageJson] = await Promise.all([availRes.json(), mileageRes.json()]);

      const avail  = new Set<string>((availJson.data || []).map((v: Vehicle) => v.id));
      const inProg = new Set<string>((availJson.in_progress_ids || []) as string[]);
      setAvailableIds(avail);
      setInProgressIds(inProg);
      const booked = new Set<string>(
        allVehicles
          .filter(v => v.status !== 'maintenance' && v.status !== 'inactive' && !avail.has(v.id) && !inProg.has(v.id))
          .map(v => v.id)
      );
      setBookedIds(booked);
      setMileageDateMap(mileageJson.data || {});
      setFilterStatus('');
    } catch {
      setAvailableIds(null);
      setMileageDateMap({});
    } finally {
      setChecking(false);
    }
  }, [allVehicles]);

  useEffect(() => { checkDate(filterDate); }, [filterDate, checkDate]);

  /* 날짜 선택 시 표시 상태 결정
   * - 날짜 쿼리 결과(availableIds)를 기준으로 판단
   * - DB status(in_use)는 관리 버튼 표시 여부에만 사용
   * - 선택 날짜에 배차 일정이 없으면 in_use 차량도 '사용 가능'으로 표시 */
  function resolveStatus(v: Vehicle): string {
    if (availableIds === null) {
      // 날짜 미선택: 정비중·비활성만 그대로, 나머지는 모두 사용가능
      if (v.status === 'maintenance') return 'maintenance';
      if (v.status === 'inactive')    return 'inactive';
      return 'available';
    }
    // 날짜 선택: 해당 날짜 배차 현황 기준
    if (v.status === 'maintenance') return 'maintenance';
    if (v.status === 'inactive')    return 'inactive';
    if (inProgressIds.has(v.id))   return 'in_progress'; // 운행중
    if (!availableIds.has(v.id))   return 'booked';      // 배차완료
    return 'available';
  }

  const displayed = allVehicles
    .map(v => ({ ...v, displayStatus: resolveStatus(v) }))
    .filter(v => {
      if (filterGroup  && v.vehicle_group?.id !== filterGroup)  return false;
      if (filterStatus && v.displayStatus !== filterStatus)      return false;
      return true;
    });

  /* 요약 카운트 */
  const allResolved = allVehicles.map(v => resolveStatus(v));
  const counts = {
    total:       allVehicles.length,
    available:   allResolved.filter(s => s === 'available').length,
    in_use:      allResolved.filter(s => s === 'in_use').length,
    in_progress: allResolved.filter(s => s === 'in_progress').length,
    booked:      allResolved.filter(s => s === 'booked').length,
    maintenance: allResolved.filter(s => s === 'maintenance').length,
    inactive:    allResolved.filter(s => s === 'inactive').length,
  };

  const isDateMode = availableIds !== null;
  const today = format(new Date(), 'yyyy-MM-dd');

  const statusOptions = isDateMode ? [
    { value: '',            label: '전체' },
    { value: 'available',   label: `사용 가능 (${counts.available})` },
    { value: 'in_progress', label: `운행 중 (${counts.in_progress})` },
    { value: 'booked',      label: `배차 완료 (${counts.booked})` },
    { value: 'maintenance', label: `정비 중 (${counts.maintenance})` },
    { value: 'inactive',    label: `비활성 (${counts.inactive})` },
  ] : [
    { value: '',            label: '전체' },
    { value: 'available',   label: '사용가능' },
    { value: 'in_use',      label: '운행중' },
    { value: 'maintenance', label: '정비중' },
    { value: 'inactive',    label: '비활성' },
  ];

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['차량군명', '제조사', '차량번호', '모델명', '연식', '정원(명)', '연료', '현재주행거리(km)'],
      ['승합차량', '현대 스타렉스', '서울12가1234', '스타렉스 어반', 2021, 12, '경유', 78400],
    ]);
    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 8 },  { wch: 10 }, { wch: 30 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '차량입력양식');
    XLSX.writeFile(wb, '차량_입력양식.xlsx');
  }

  async function downloadData() {
    const t = new Date();
    const dateStr = `${t.getFullYear()}${String(t.getMonth()+1).padStart(2,'0')}${String(t.getDate()).padStart(2,'0')}`;

    const STATUS_LABELS: Record<string, string> = {
      available: '사용가능', in_use: '사용가능', maintenance: '정비중', inactive: '비활성',
    };

    // 활성 배차 (scheduled + in_progress) 전체 조회
    const dispatchRes = await fetch('/api/dispatches?page_size=1000').then(r => r.json());
    const activeDispatches = ((dispatchRes.data || []) as any[]).filter(
      d => ['scheduled', 'in_progress'].includes(d.status)
    );

    // vehicle_id별 배차 기간 목록
    const dispatchMap: Record<string, string[]> = {};
    for (const d of activeDispatches) {
      if (!d.vehicle_id) continue;
      const startStr = d.request?.start_datetime || d.scheduled_start;
      const endStr   = d.request?.end_datetime   || d.scheduled_end;
      if (!startStr) continue;
      const start = format(new Date(startStr), 'yy.MM.dd(EEE)', { locale: ko });
      const end   = endStr ? format(new Date(endStr), 'MM.dd(EEE)', { locale: ko }) : '';
      const label = end ? `${start}~${end}` : start;
      if (!dispatchMap[d.vehicle_id]) dispatchMap[d.vehicle_id] = [];
      dispatchMap[d.vehicle_id].push(label);
    }

    const rows = allVehicles.map(v => ({
      차량군: v.vehicle_group?.name || '',
      제조사: v.name,
      차량번호: v.license_plate,
      모델명: v.model || '',
      연식: v.year || '',
      정원: v.capacity || '',
      연료: FUEL_TYPE_LABELS[v.fuel_type] || v.fuel_type,
      '현재주행거리(km)': v.current_mileage,
      상태: STATUS_LABELS[v.status] || v.status,
      배차일: (dispatchMap[v.id] || []).join(' / '),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
      { wch: 8 },  { wch: 8 },  { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 40 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '차량목록');
    XLSX.writeFile(wb, `차량목록_${dateStr}.xlsx`);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    const FUEL_KO_MAP: Record<string, string> = {
      휘발유: 'gasoline', 가솔린: 'gasoline', 경유: 'diesel', 디젤: 'diesel', 전기: 'electric', 하이브리드: 'hybrid',
    };
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws);
        const errors: string[] = [];
        const parsed = rows
          .filter(r => r['제조사']?.toString().trim())
          .map((r, i) => {
            const groupName = (r['차량군명'] || '').toString().trim();
            const group = groups.find(g => g.name === groupName);
            if (!group) errors.push(`${i + 1}행: 차량군 "${groupName}"을 찾을 수 없습니다`);
            const fuelKo = (r['연료'] || '').toString().trim();
            return {
              name: (r['제조사'] || '').toString().trim(),
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
        if (errors.length > 0) { setImportError(errors.join(' | ')); return; }
        if (parsed.length === 0) { setImportError('데이터가 없습니다. 양식을 확인해주세요.'); return; }
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

  async function handleStatusChange(id: string, nextStatus: string) {
    const res = await fetch(`/api/vehicles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    const json = await res.json();
    if (json.error) alert(json.error);
    else fetchData();
  }

  async function handleDelete(id: string) {
    const target = allVehicles.find(v => v.id === id);
    if (!confirm(`"${vehicleName(target)}" 차량을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) alert(json.error);
    else fetchData();
  }

  /* 신규 등록 */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(''); setSubmitting(true);
    const body: Record<string, unknown> = {
      vehicle_group_id: form.vehicle_group_id, name: form.name,
      license_plate: form.license_plate, fuel_type: form.fuel_type,
      current_mileage: Number(form.current_mileage) || 0,
    };
    if (form.model)    body.model    = form.model;
    if (form.year)     body.year     = Number(form.year);
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

  /* 수정 모달 열기 */
  function openEdit(v: Vehicle) {
    setEditVehicle(v);
    setEditForm({
      vehicle_group_id: v.vehicle_group?.id ?? '',
      name:             v.name,
      license_plate:    v.license_plate,
      model:            v.model ?? '',
      year:             v.year?.toString() ?? '',
      capacity:         v.capacity?.toString() ?? '',
      fuel_type:        v.fuel_type,
      current_mileage:  v.current_mileage.toString(),
    });
    setEditError('');
  }

  /* 수정 제출 */
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editVehicle) return;
    setEditError(''); setEditSubmitting(true);

    const body: Record<string, unknown> = {
      name:          editForm.name,
      license_plate: editForm.license_plate,
      fuel_type:     editForm.fuel_type,
      current_mileage: Number(editForm.current_mileage) || 0,
    };
    if (editForm.vehicle_group_id) body.vehicle_group_id = editForm.vehicle_group_id;
    if (editForm.model)    body.model    = editForm.model;
    if (editForm.year)     body.year     = Number(editForm.year);
    if (editForm.capacity) body.capacity = Number(editForm.capacity);

    const res = await fetch(`/api/vehicles/${editVehicle.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) setEditError(json.error);
    else { setEditVehicle(null); fetchData(); }
    setEditSubmitting(false);
  }

  /* 공용 폼 필드 렌더러 */
  const FormFields = ({
    f: form, setF,
  }: { f: VehicleForm; setF: React.Dispatch<React.SetStateAction<VehicleForm>> }) => (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="block text-sm font-medium text-gray-600 mb-1.5">차량군 <span className="text-red-500">*</span></label>
        <select value={form.vehicle_group_id}
          onChange={e => setF(p => ({ ...p, vehicle_group_id: e.target.value }))} required
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">선택하세요</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      {([
        { label: '제조사',    key: 'name',          required: true,  placeholder: '예: 기아 K5' },
        { label: '차량번호',  key: 'license_plate', required: true,  placeholder: '예: 서울12가3456' },
        { label: '모델명',    key: 'model',          placeholder: '예: K5 2.0 LPi' },
        { label: '연식',      key: 'year',           type: 'number',  placeholder: '예: 2022' },
        { label: '정원 (명)', key: 'capacity',       type: 'number',  placeholder: '예: 5' },
      ] as { label: string; key: string; required?: boolean; type?: string; placeholder?: string }[]).map(field => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-600 mb-1.5">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          <input type={field.type || 'text'} required={field.required}
            value={(form as any)[field.key]} placeholder={field.placeholder}
            onChange={e => setF(p => ({ ...p, [field.key]: e.target.value }))}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      ))}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1.5">연료 <span className="text-red-500">*</span></label>
        <select value={form.fuel_type} onChange={e => setF(p => ({ ...p, fuel_type: e.target.value }))} required
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="gasoline">휘발유</option>
          <option value="diesel">경유</option>
          <option value="electric">전기</option>
          <option value="hybrid">하이브리드</option>
        </select>
      </div>
      {/* 주행거리 — 수동 입력 강조 */}
      <div className="col-span-2">
        <label className="block text-sm font-medium text-gray-600 mb-1.5">
          현재 주행거리 (km)
          <span className="ml-1.5 text-xs font-normal text-blue-500">· 관리자 직접 입력</span>
        </label>
        <input type="number" min={0}
          value={form.current_mileage}
          onChange={e => setF(p => ({ ...p, current_mileage: e.target.value }))}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <p className="text-xs text-gray-400 mt-1">
          신청자가 반납 주행거리를 미입력한 경우 관리자가 직접 수정할 수 있습니다.
        </p>
      </div>
    </div>
  );

  return (
    <div className="p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">차량 관리</h1>
          <p className="text-gray-500 mt-1.5 text-base">차량 등록, 수정, 상태 변경, 삭제를 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadTemplate}
            className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors">
            ↓ 양식
          </button>
          <button onClick={downloadData}
            className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors">
            ↓ 목록
          </button>
          <button
            onClick={() => { setShowModal(true); setFormError(''); setForm(EMPTY_FORM); }}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            <span className="text-xl leading-none">+</span> 차량 등록
          </button>
        </div>
      </div>

      {/* 날짜 선택 바 */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm px-5 py-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 flex-shrink-0">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            날짜별 현황 조회
          </div>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setFilterDate(today)}
            className={`px-3.5 py-2 text-sm font-medium border rounded-lg transition-colors ${
              filterDate === today
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}>
            오늘
          </button>
          {filterDate && (
            <button
              onClick={() => setFilterDate('')}
              className="px-3.5 py-2 text-sm font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              초기화
            </button>
          )}
          {checking && (
            <span className="text-sm text-blue-500 flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              조회 중...
            </span>
          )}
          {isDateMode && filterDate && !checking && (
            <span className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3.5 py-1.5 rounded-full">
              📅 {format(new Date(filterDate + 'T00:00:00'), 'yyyy년 M월 d일(EEE)', { locale: ko })} 기준 배차 현황
            </span>
          )}
          {!filterDate && (
            <span className="text-sm text-gray-400">날짜를 선택하면 해당 날짜의 차량 상태를 확인할 수 있습니다</span>
          )}
        </div>

        {/* 날짜 선택 시 요약 카운트 */}
        {isDateMode && !checking && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            {[
              { key: 'available',   label: '사용 가능', count: counts.available,   color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
              { key: 'in_progress', label: '운행 중',   count: counts.in_progress, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
              { key: 'booked',      label: '배차 완료', count: counts.booked,      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-100' },
              { key: 'maintenance', label: '정비 중',   count: counts.maintenance, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100' },
              { key: 'inactive',    label: '비활성',    count: counts.inactive,    color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-100' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setFilterStatus(prev => prev === s.key ? '' : s.key)}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl border transition-all ${s.bg} ${s.border} ${
                  filterStatus === s.key ? 'ring-2 ring-blue-400 shadow-sm' : 'hover:shadow-sm'
                }`}>
                <span className={`text-2xl font-bold ${s.color}`}>{s.count}</span>
                <span className="text-sm text-gray-500">{s.label}</span>
              </button>
            ))}
            <span className="text-sm text-gray-400 flex items-center ml-auto">
              총 {counts.total}대
            </span>
          </div>
        )}

        {/* 날짜 미선택 시 요약 */}
        {!isDateMode && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            {[
              { key: '',            label: '전체',    count: counts.total,       color: 'text-gray-700',   bg: 'bg-gray-50',   border: 'border-gray-100' },
              { key: 'available',   label: '사용가능', count: counts.available,   color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
              { key: 'maintenance', label: '정비중',   count: counts.maintenance, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-100' },
              { key: 'inactive',    label: '비활성',   count: counts.inactive,    color: 'text-gray-400',   bg: 'bg-gray-50',   border: 'border-gray-100' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setFilterStatus(s.key)}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl border transition-all ${s.bg} ${s.border} ${
                  filterStatus === s.key ? 'ring-2 ring-blue-400 shadow-sm' : 'hover:shadow-sm'
                }`}>
                <span className={`text-2xl font-bold ${s.color}`}>{s.count}</span>
                <span className="text-sm text-gray-500">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 차량군 필터 */}
      {groups.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-5">
          <div className="flex items-center px-5 py-3.5">
            <span className="w-16 text-sm font-bold text-gray-400 uppercase tracking-widest flex-shrink-0">차량군</span>
            <div className="flex flex-1 gap-1.5">
              <button onClick={() => setFilterGroup('')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors text-center ${
                  !filterGroup ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                }`}>전체</button>
              {groups.map(g => (
                <button key={g.id} onClick={() => setFilterGroup(g.id)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors text-center ${
                    filterGroup === g.id ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                  }`}>{g.name}</button>
              ))}
            </div>
          </div>
        </div>
      )}

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
              {importPreview.map((v, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">{v.group_name}</span>
                  <span className="font-medium text-gray-800">{vehicleName(v)}</span>
                  <span className="text-xs text-gray-400 font-mono">{v.license_plate}</span>
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

      {/* 차량 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {filterStatus
              ? `${statusOptions.find(o => o.value === filterStatus)?.label?.split(' (')[0]} 차량`
              : '전체 차량'}{' '}
            <span className="font-bold text-gray-700">{displayed.length}대</span>
            {isDateMode && filterDate && (
              <span className="ml-2 text-blue-500">
                · {format(new Date(filterDate + 'T00:00:00'), 'M/d(EEE)', { locale: ko })} 기준
              </span>
            )}
          </p>
          {isDateMode && filterStatus && (
            <button onClick={() => setFilterStatus('')} className="text-xs text-gray-400 hover:text-gray-600 font-medium">
              필터 해제
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">제조사</th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">모델명</th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">차량번호</th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">차량군</th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">연식</th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">정원</th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">연료</th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">
                주행거리
                {isDateMode && <span className="ml-1 text-xs font-normal text-blue-400">날짜 기준</span>}
              </th>
              <th className="text-left px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">
                상태
                {isDateMode && <span className="ml-1 text-xs font-normal text-blue-400">날짜 기준</span>}
              </th>
              <th className="text-right px-5 py-3 text-sm font-semibold text-gray-500 whitespace-nowrap">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="text-center py-14 text-gray-400 text-sm">불러오는 중...</td></tr>
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-14 text-gray-400 text-sm">
                  {allVehicles.length === 0 ? '등록된 차량이 없습니다' : '조건에 맞는 차량이 없습니다'}
                </td>
              </tr>
            ) : displayed.map(v => {
              const ds = v.displayStatus;
              const badge = isDateMode
                ? (DATE_STATUS[ds] || DATE_STATUS.inactive)
                : (DB_STATUS[ds] || { label: ds, badgeColor: 'bg-gray-100 text-gray-600' });

              return (
                <tr key={v.id} className="hover:bg-gray-50/60 transition-colors group">
                  <td className="px-5 py-3.5 font-semibold text-gray-900 text-sm whitespace-nowrap">{v.name}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-sm whitespace-nowrap">{v.model || <span className="text-gray-300">-</span>}</td>
                  <td className="px-5 py-3.5 font-mono text-gray-400 text-sm whitespace-nowrap">{v.license_plate}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-sm whitespace-nowrap">{v.vehicle_group?.name ?? <span className="text-gray-300">-</span>}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-sm whitespace-nowrap">{v.year ? `${v.year}년` : <span className="text-gray-300">-</span>}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-sm whitespace-nowrap">{v.capacity ? `${v.capacity}명` : <span className="text-gray-300">-</span>}</td>
                  <td className="px-5 py-3.5 text-gray-500 text-sm whitespace-nowrap">{FUEL_TYPE_LABELS[v.fuel_type] ?? v.fuel_type}</td>
                  <td className="px-5 py-3.5 text-sm whitespace-nowrap">
                    {isDateMode && mileageDateMap[v.id] !== undefined ? (
                      <span className="text-blue-600 font-semibold">
                        {mileageDateMap[v.id].toLocaleString()} km
                      </span>
                    ) : (
                      <span className="text-gray-600">{v.current_mileage.toLocaleString()} km</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {isDateMode && (DATE_STATUS[ds] as any)?.dot && (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${(DATE_STATUS[ds] as any).dot}`} />
                      )}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.badgeColor}`}>
                        {badge.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {/* 수정 버튼 */}
                      <button
                        onClick={() => openEdit(v)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        수정
                      </button>

                      {v.status === 'in_use' ? (
                        <span className="text-xs text-gray-300 px-2 py-1.5 whitespace-nowrap">
                          배차 중
                        </span>
                      ) : (
                        <>
                          <span className="w-px h-4 bg-gray-200 mx-0.5" />
                          {/* 상태 변경 버튼 */}
                          {(STATUS_ACTIONS[v.status] || []).map(action => (
                            <button key={action.next}
                              onClick={() => handleStatusChange(v.id, action.next)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${action.color}`}>
                              {action.label}
                            </button>
                          ))}
                          {/* 삭제 버튼 */}
                          <button onClick={() => handleDelete(v.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── 차량 등록 모달 ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">차량 등록</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-600">{formError}</div>
              )}
              <FormFields f={form} setF={setForm} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">취소</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-60">
                  {submitting ? '등록 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 차량 수정 모달 ── */}
      {editVehicle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900">차량 정보 수정</h2>
                <p className="text-sm text-gray-400 mt-0.5">{editVehicle.name} · {editVehicle.license_plate}</p>
              </div>
              <button onClick={() => setEditVehicle(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleEditSubmit} className="px-6 py-5 space-y-4">
              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-600">{editError}</div>
              )}
              <FormFields f={editForm} setF={setEditForm} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditVehicle(null)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">취소</button>
                <button type="submit" disabled={editSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-60">
                  {editSubmitting ? '저장 중...' : '저장하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
