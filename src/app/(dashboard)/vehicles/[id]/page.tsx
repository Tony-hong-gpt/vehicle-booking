'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { VEHICLE_STATUS_LABELS, VEHICLE_STATUS_COLORS, FUEL_TYPE_LABELS } from '@/lib/constants';

/* ─── 상수 ─── */
const DISPATCH_STATUS: Record<string, { label: string; color: string }> = {
  scheduled:   { label: '배차완료', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '운행중',   color: 'bg-purple-100 text-purple-700' },
  completed:   { label: '반납완료', color: 'bg-green-100 text-green-700' },
  cancelled:   { label: '취소',     color: 'bg-gray-100 text-gray-500' },
};

const MAINT_TYPE: Record<string, { label: string; color: string; icon: string }> = {
  inspection: { label: '정기검사',  color: 'bg-blue-100 text-blue-700',   icon: '🔍' },
  repair:     { label: '수리',      color: 'bg-red-100 text-red-700',     icon: '🔧' },
  wash:       { label: '세차',      color: 'bg-cyan-100 text-cyan-700',   icon: '🚿' },
  tire:       { label: '타이어',    color: 'bg-orange-100 text-orange-700', icon: '🛞' },
  oil:        { label: '오일교환',  color: 'bg-yellow-100 text-yellow-700', icon: '🛢️' },
  other:      { label: '기타',      color: 'bg-gray-100 text-gray-600',   icon: '📋' },
};

const STATUS_OPTIONS = [
  { value: 'available', label: '사용 가능' }, { value: 'in_use', label: '운행 중' },
  { value: 'maintenance', label: '정비 중' }, { value: 'inactive', label: '비운행' },
];
const FUEL_OPTIONS = [
  { value: 'gasoline', label: '휘발유' }, { value: 'diesel', label: '경유' },
  { value: 'electric', label: '전기' },   { value: 'hybrid', label: '하이브리드' },
];

const EMPTY_MAINT = {
  maintenance_type: 'inspection',
  description: '',
  cost: '',
  maintenance_date: format(new Date(), 'yyyy-MM-dd'),
  next_maintenance_date: '',
  performed_by: '',
};

/* ─── 헬퍼 ─── */
function fmt(iso: string, f = 'yyyy.MM.dd HH:mm') {
  try { return format(new Date(iso), f, { locale: ko }); } catch { return '-'; }
}
function today() { return format(new Date(), 'yyyy-MM-dd'); }

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-400 w-32 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

/* ─── 메인 ─── */
export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState('');

  const [vehicle,      setVehicle]      = useState<any>(null);
  const [dispatches,   setDispatches]   = useState<any[]>([]);
  const [mileageLogs,  setMileageLogs]  = useState<any[]>([]);
  const [maintenances, setMaintenances] = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [userRole,     setUserRole]     = useState('');

  const [tab, setTab] = useState<'overview' | 'stats' | 'dispatches' | 'mileage' | 'maintenance'>('overview');

  /* 날짜 필터 */
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');

  /* 차량 정보 편집 */
  const [editing,   setEditing]   = useState(false);
  const [editForm,  setEditForm]  = useState<any>({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  /* 정비 등록/수정 모달 */
  const [maintModal,   setMaintModal]   = useState(false);
  const [editingMaint, setEditingMaint] = useState<any>(null); // null=신규
  const [maintForm,    setMaintForm]    = useState({ ...EMPTY_MAINT });
  const [maintSaving,  setMaintSaving]  = useState(false);
  const [maintError,   setMaintError]   = useState('');

  useEffect(() => { params.then(p => setId(p.id)); }, [params]);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [vRes, dRes, mRes, mnRes, meRes] = await Promise.all([
      fetch(`/api/vehicles/${id}`).then(r => r.json()),
      fetch(`/api/dispatches?vehicle_id=${id}&page_size=200`).then(r => r.json()),
      fetch(`/api/mileage?vehicle_id=${id}&page_size=200`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/maintenances?vehicle_id=${id}`).then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()),
    ]);
    setVehicle(vRes.data ?? null);
    setDispatches(dRes.data ?? []);
    setMileageLogs(mRes.data ?? []);
    setMaintenances(mnRes.data ?? []);
    setUserRole(meRes.data?.role ?? '');
    if (vRes.data) {
      setEditForm({
        status: vRes.data.status, current_mileage: vRes.data.current_mileage,
        capacity: vRes.data.capacity ?? '', year: vRes.data.year ?? '',
        model: vRes.data.model ?? '', fuel_type: vRes.data.fuel_type,
      });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ── 날짜 필터 적용 ── */
  function inRange(isoDate: string) {
    if (!filterFrom && !filterTo) return true;
    try {
      const d = parseISO(isoDate.slice(0, 10));
      const from = filterFrom ? startOfDay(parseISO(filterFrom)) : new Date(0);
      const to   = filterTo   ? endOfDay(parseISO(filterTo))     : new Date(9999, 0);
      return isWithinInterval(d, { start: from, end: to });
    } catch { return true; }
  }

  const filteredDispatches  = dispatches.filter(d => inRange(d.scheduled_start));
  const filteredMileage     = mileageLogs.filter(l => inRange(l.log_date));
  const filteredMaint       = maintenances.filter(m => inRange(m.maintenance_date));

  /* ── 차량 정보 저장 ── */
  async function handleSave() {
    setSaving(true); setSaveError('');
    const res = await fetch(`/api/vehicles/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: editForm.status, current_mileage: Number(editForm.current_mileage),
        capacity: editForm.capacity ? Number(editForm.capacity) : undefined,
        year: editForm.year ? Number(editForm.year) : undefined,
        model: editForm.model || undefined, fuel_type: editForm.fuel_type,
      }),
    });
    const json = await res.json();
    if (json.error) setSaveError(json.error);
    else { setVehicle(json.data); setEditing(false); }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm(`"${vehicle?.name}" 차량을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) alert(json.error); else router.push('/vehicles');
  }

  /* ── 정비 등록/수정 ── */
  function openNewMaint() {
    setEditingMaint(null);
    setMaintForm({ ...EMPTY_MAINT, maintenance_date: today() });
    setMaintError(''); setMaintModal(true);
  }
  function openEditMaint(m: any) {
    setEditingMaint(m);
    setMaintForm({
      maintenance_type: m.maintenance_type,
      description: m.description ?? '',
      cost: m.cost ?? '',
      maintenance_date: m.maintenance_date,
      next_maintenance_date: m.next_maintenance_date ?? '',
      performed_by: m.performed_by ?? '',
    });
    setMaintError(''); setMaintModal(true);
  }
  async function saveMaint() {
    setMaintSaving(true); setMaintError('');
    const body = {
      vehicle_id: id,
      ...maintForm,
      cost: maintForm.cost ? Number(maintForm.cost) : null,
    };
    const url    = editingMaint ? `/api/maintenances/${editingMaint.id}` : '/api/maintenances';
    const method = editingMaint ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.error) { setMaintError(json.error); }
    else { setMaintModal(false); fetchAll(); }
    setMaintSaving(false);
  }
  async function deleteMaint(m: any) {
    if (!confirm('정비 기록을 삭제하시겠습니까?')) return;
    const res = await fetch(`/api/maintenances/${m.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) alert(json.error); else fetchAll();
  }

  /* ── 렌더 ── */
  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">불러오는 중...</div>;
  if (!vehicle) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-gray-500">차량을 찾을 수 없습니다</p>
      <Link href="/vehicles" className="text-blue-600 text-sm">목록으로</Link>
    </div>
  );

  const isAdmin = ['admin', 'manager'].includes(userRole);
  const activeDispatch  = dispatches.find(d => d.status === 'in_progress');
  const scheduledDisp   = filteredDispatches.filter(d => d.status === 'scheduled');
  const completedDisp   = filteredDispatches.filter(d => ['completed', 'cancelled'].includes(d.status));
  const totalTrips      = dispatches.filter(d => d.status === 'completed').length;
  const totalKm         = mileageLogs.reduce((s: number, l: any) =>
    l.start_mileage != null && l.end_mileage != null ? s + (l.end_mileage - l.start_mileage) : s, 0);

  const hasDateFilter = !!(filterFrom || filterTo);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* ── 브레드크럼 ── */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/vehicles" className="hover:text-blue-600 transition-colors">차량 현황</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{vehicle.name}</span>
      </div>

      {/* ── 타이틀 카드 ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              vehicle.status === 'available' ? 'bg-green-50' :
              vehicle.status === 'in_use'    ? 'bg-purple-50' :
              vehicle.status === 'maintenance' ? 'bg-orange-50' : 'bg-gray-100'
            }`}>
              <svg className={`w-7 h-7 ${
                vehicle.status === 'available' ? 'text-green-500' :
                vehicle.status === 'in_use'    ? 'text-purple-500' :
                vehicle.status === 'maintenance' ? 'text-orange-500' : 'text-gray-400'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{vehicle.name}</h1>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${VEHICLE_STATUS_COLORS[vehicle.status]}`}>
                  {VEHICLE_STATUS_LABELS[vehicle.status]}
                </span>
              </div>
              <p className="text-gray-400 font-mono mt-1">{vehicle.license_plate} · {vehicle.vehicle_group?.name}</p>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2 flex-shrink-0">
              {editing ? (
                <>
                  <button onClick={() => { setEditing(false); setSaveError(''); }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">취소</button>
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditing(true); setSaveError(''); }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>수정
                  </button>
                  <button onClick={handleDelete}
                    className="px-4 py-2 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50">삭제</button>
                </>
              )}
            </div>
          )}
        </div>
        {saveError && <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{saveError}</div>}
        {/* 통계 */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-100">
          {[
            { label: '현재 주행거리',  value: `${vehicle.current_mileage.toLocaleString()} km` },
            { label: '총 완료 운행',   value: `${totalTrips}회` },
            { label: '누적 운행거리',  value: totalKm > 0 ? `${totalKm.toLocaleString()} km` : '기록 없음' },
            { label: '정비 이력',      value: `${maintenances.length}건` },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 날짜 필터 ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-5 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          기간 조회
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">~</span>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {/* 빠른 선택 */}
        {[
          { label: '오늘', fn: () => { const t = today(); setFilterFrom(t); setFilterTo(t); } },
          { label: '이번 주', fn: () => {
            const d = new Date(); const mon = new Date(d);
            mon.setDate(d.getDate() - d.getDay() + 1);
            const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
            setFilterFrom(format(mon, 'yyyy-MM-dd')); setFilterTo(format(sun, 'yyyy-MM-dd'));
          }},
          { label: '이번 달', fn: () => {
            const d = new Date();
            setFilterFrom(format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd'));
            setFilterTo(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), 'yyyy-MM-dd'));
          }},
        ].map(btn => (
          <button key={btn.label} onClick={btn.fn}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            {btn.label}
          </button>
        ))}
        {hasDateFilter && (
          <button onClick={() => { setFilterFrom(''); setFilterTo(''); }}
            className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            초기화
          </button>
        )}
        {hasDateFilter && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
            {filterFrom || '시작'} ~ {filterTo || '종료'} 기간 적용 중
          </span>
        )}
      </div>

      {/* ── 탭 ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {[
          { key: 'overview',     label: '차량 정보' },
          { key: 'stats',        label: '운행 통계' },
          { key: 'dispatches',   label: `운행 현황 (${filteredDispatches.length})` },
          { key: 'mileage',      label: `주행 일지 (${filteredMileage.length})` },
          { key: 'maintenance',  label: `정비 이력 (${filteredMaint.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ 탭: 차량 정보 ══ */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-5">
          {/* 기본 정보 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">기본 정보</h3>
            </div>
            <div className="px-5 py-3">
              {editing ? (
                <div className="space-y-3 py-1">
                  {[
                    { label: '상태', field: (
                      <select value={editForm.status}
                        onChange={e => setEditForm((p: any) => ({ ...p, status: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )},
                    { label: '연료', field: (
                      <select value={editForm.fuel_type}
                        onChange={e => setEditForm((p: any) => ({ ...p, fuel_type: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {FUEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )},
                  ].map(({ label, field }) => (
                    <div key={label}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>{field}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '모델명', key: 'model', type: 'text' },
                      { label: '연식', key: 'year', type: 'number' },
                      { label: '정원 (명)', key: 'capacity', type: 'number' },
                      { label: '현재 주행거리 (km)', key: 'current_mileage', type: 'number' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                        <input type={f.type} value={editForm[f.key] ?? ''}
                          onChange={e => setEditForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="차량군" value={vehicle.vehicle_group?.name ?? '-'} />
                  <InfoRow label="상태" value={
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VEHICLE_STATUS_COLORS[vehicle.status]}`}>
                      {VEHICLE_STATUS_LABELS[vehicle.status]}
                    </span>
                  } />
                  <InfoRow label="모델명"  value={vehicle.model ?? '-'} />
                  <InfoRow label="연식"    value={vehicle.year ? `${vehicle.year}년` : '-'} />
                  <InfoRow label="정원"    value={vehicle.capacity ? `${vehicle.capacity}명` : '-'} />
                  <InfoRow label="연료"    value={FUEL_TYPE_LABELS[vehicle.fuel_type] ?? vehicle.fuel_type} />
                  <InfoRow label="현재 주행거리" value={`${vehicle.current_mileage.toLocaleString()} km`} />
                </>
              )}
            </div>
          </div>

          {/* 우측: 현재 운행 + 예정 배차 */}
          <div className="space-y-4">
            {/* 현재 운행 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className={`px-5 py-3.5 border-b border-gray-100 ${activeDispatch ? 'bg-purple-50' : 'bg-gray-50'}`}>
                <h3 className="text-sm font-semibold text-gray-700">
                  {activeDispatch ? '🟣 현재 운행 중' : '현재 운행 없음'}
                </h3>
              </div>
              <div className="px-5 py-3">
                {activeDispatch ? (
                  <>
                    <InfoRow label="신청 번호" value={
                      <Link href={`/requests/${activeDispatch.request?.id}`}
                        className="text-blue-600 hover:underline font-mono text-xs">
                        {activeDispatch.request?.request_no}
                      </Link>
                    } />
                    <InfoRow label="목적지"   value={activeDispatch.request?.destination ?? '-'} />
                    <InfoRow label="신청자"   value={activeDispatch.request?.requester?.name ?? '-'} />
                    <InfoRow label="출발"     value={fmt(activeDispatch.scheduled_start)} />
                    <InfoRow label="반납 예정" value={fmt(activeDispatch.scheduled_end)} />
                    {activeDispatch.driver?.user && (
                      <InfoRow label="기사" value={activeDispatch.driver.user.name} />
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">현재 운행 중인 배차가 없습니다</p>
                )}
              </div>
            </div>

            {/* 예정된 배차 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">
                  예정된 배차 ({scheduledDisp.length}건){hasDateFilter && <span className="text-xs font-normal text-blue-600 ml-2">기간 필터 적용</span>}
                </h3>
              </div>
              <div className="px-5 py-3">
                {scheduledDisp.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">예정된 배차가 없습니다</p>
                ) : (
                  <div className="space-y-3">
                    {scheduledDisp.slice(0, 6).map(d => (
                      <div key={d.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{d.request?.destination}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fmt(d.scheduled_start, 'MM/dd(EEE) HH:mm')} ~ {fmt(d.scheduled_end, 'MM/dd HH:mm')}
                          </p>
                          <p className="text-xs text-gray-400">{d.request?.requester?.name}</p>
                        </div>
                        <Link href={`/requests/${d.request?.id}`}
                          className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0 mt-1">보기</Link>
                      </div>
                    ))}
                    {scheduledDisp.length > 6 && (
                      <p className="text-xs text-gray-400 text-center pt-1">+{scheduledDisp.length - 6}건 더 있음 · 운행 현황 탭에서 전체 확인</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ 탭: 운행 통계 ══ */}
      {tab === 'stats' && (() => {
        const completedDispatches = dispatches.filter(d => d.status === 'completed');

        // 최근 12개월 월별 운행 횟수
        const now = new Date();
        const months = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
          return { key: format(d, 'yyyy-MM'), label: format(d, 'M월'), year: d.getFullYear(), month: d.getMonth() };
        });
        const monthlyCount: Record<string, number> = {};
        const monthlyKm: Record<string, number> = {};
        completedDispatches.forEach((d: any) => {
          const key = d.scheduled_start?.slice(0, 7);
          if (key) monthlyCount[key] = (monthlyCount[key] || 0) + 1;
        });
        mileageLogs.forEach((l: any) => {
          const key = l.log_date?.slice(0, 7);
          if (key && l.start_mileage != null && l.end_mileage != null) {
            monthlyKm[key] = (monthlyKm[key] || 0) + (l.end_mileage - l.start_mileage);
          }
        });
        const maxCount = Math.max(1, ...months.map(m => monthlyCount[m.key] || 0));

        // 목적지 Top 5
        const destCount: Record<string, number> = {};
        completedDispatches.forEach((d: any) => {
          const dest = d.request?.destination;
          if (dest) destCount[dest] = (destCount[dest] || 0) + 1;
        });
        const topDests = Object.entries(destCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxDest = Math.max(1, ...topDests.map(([, c]) => c));

        // 요일별 운행
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayCount: number[] = Array(7).fill(0);
        completedDispatches.forEach((d: any) => {
          if (d.scheduled_start) dayCount[new Date(d.scheduled_start).getDay()]++;
        });
        const maxDay = Math.max(1, ...dayCount);

        const avgKm = totalKm > 0 && completedDispatches.length > 0
          ? Math.round(totalKm / completedDispatches.length) : 0;

        return (
          <div className="space-y-5">
            {/* 요약 카드 */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: '총 운행 횟수', value: `${completedDispatches.length}회`, sub: '반납완료 기준', color: 'text-blue-600' },
                { label: '누적 운행거리', value: totalKm > 0 ? `${totalKm.toLocaleString()} km` : '-', sub: '주행일지 기준', color: 'text-purple-600' },
                { label: '평균 운행거리', value: avgKm > 0 ? `${avgKm.toLocaleString()} km` : '-', sub: '운행당 평균', color: 'text-green-600' },
                { label: '정비 이력', value: `${maintenances.length}건`, sub: `총 ${maintenances.reduce((s, m: any) => s + (m.cost || 0), 0).toLocaleString()}원`, color: 'text-orange-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-sm font-medium text-gray-700 mt-1">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-5">
              {/* 월별 운행 횟수 바 차트 */}
              <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">월별 운행 횟수 (최근 12개월)</h3>
                <div className="flex items-end gap-1.5 h-36">
                  {months.map(m => {
                    const cnt = monthlyCount[m.key] || 0;
                    const heightPct = Math.round((cnt / maxCount) * 100);
                    const isThisMonth = m.key === format(now, 'yyyy-MM');
                    return (
                      <div key={m.key} className="flex flex-col items-center gap-1 flex-1">
                        <span className="text-xs text-gray-500 font-medium">{cnt > 0 ? cnt : ''}</span>
                        <div className="w-full flex items-end" style={{ height: '100px' }}>
                          <div
                            className={`w-full rounded-t-md transition-all ${isThisMonth ? 'bg-blue-500' : 'bg-blue-200'}`}
                            style={{ height: cnt === 0 ? '2px' : `${Math.max(8, heightPct)}%`, minHeight: cnt === 0 ? '2px' : undefined }}
                          />
                        </div>
                        <span className={`text-xs ${isThisMonth ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 요일별 운행 */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">요일별 운행 빈도</h3>
                <div className="space-y-2">
                  {dayNames.map((name, i) => {
                    const cnt = dayCount[i];
                    const pct = Math.round((cnt / maxDay) * 100);
                    const isWeekend = i === 0 || i === 6;
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className={`text-xs w-4 font-medium flex-shrink-0 ${isWeekend ? 'text-red-400' : 'text-gray-500'}`}>{name}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${isWeekend ? 'bg-red-300' : 'bg-blue-400'}`}
                            style={{ width: `${Math.max(cnt > 0 ? 4 : 0, pct)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-6 text-right">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 자주 가는 목적지 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">자주 가는 목적지 Top 5</h3>
              {topDests.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">운행 완료 데이터가 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {topDests.map(([dest, cnt], idx) => (
                    <div key={dest} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                        idx === 1 ? 'bg-gray-100 text-gray-600' :
                        idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-500'
                      }`}>{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-800">{dest}</span>
                          <span className="text-xs text-gray-400">{cnt}회</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-1.5">
                          <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${(cnt / maxDest) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══ 탭: 운행 현황 ══ */}
      {tab === 'dispatches' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filteredDispatches.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {hasDateFilter ? '해당 기간의 운행 이력이 없습니다' : '운행 이력이 없습니다'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['상태', '신청 번호', '목적지', '신청자', '예정 출발', '예정 반납', '실제 출발', '실제 반납', '기사'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredDispatches.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DISPATCH_STATUS[d.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {DISPATCH_STATUS[d.status]?.label ?? d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/requests/${d.request?.id}`}
                        className="text-blue-600 hover:underline font-mono text-xs">{d.request?.request_no ?? '-'}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-900 max-w-[120px] truncate">{d.request?.destination ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{d.request?.requester?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmt(d.scheduled_start, 'MM/dd HH:mm')}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmt(d.scheduled_end, 'MM/dd HH:mm')}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{d.actual_start ? fmt(d.actual_start, 'MM/dd HH:mm') : <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{d.actual_end ? fmt(d.actual_end, 'MM/dd HH:mm') : <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{d.driver?.user?.name ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ 탭: 주행 일지 ══ */}
      {tab === 'mileage' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filteredMileage.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {hasDateFilter ? '해당 기간의 주행 일지가 없습니다' : '주행 일지가 없습니다'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['일자', '출발 km', '도착 km', '운행거리', '기사', '경로 / 비고'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredMileage.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmt(log.log_date, 'yyyy.MM.dd')}</td>
                    <td className="px-4 py-3 text-gray-700">{log.start_mileage?.toLocaleString() ?? '-'} km</td>
                    <td className="px-4 py-3 text-gray-700">{log.end_mileage?.toLocaleString() ?? '-'} km</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {log.start_mileage != null && log.end_mileage != null
                        ? `+${(log.end_mileage - log.start_mileage).toLocaleString()} km` : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.driver?.user?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{log.route || log.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ 탭: 정비 이력 ══ */}
      {tab === 'maintenance' && (
        <div className="space-y-4">
          {/* 정비 요약 카드 */}
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(MAINT_TYPE).map(([key, cfg]) => {
              const cnt = maintenances.filter(m => m.maintenance_type === key).length;
              return (
                <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                  <span className="text-2xl">{cfg.icon}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{cnt}건</p>
                    <p className="text-xs text-gray-400">{cfg.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 목록 + 등록 버튼 */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">
                정비 기록 ({filteredMaint.length}건){hasDateFilter && <span className="text-xs font-normal text-blue-600 ml-2">기간 필터 적용</span>}
              </h3>
              {isAdmin && (
                <button onClick={openNewMaint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  <span className="text-base leading-none">+</span> 정비 기록 추가
                </button>
              )}
            </div>

            {filteredMaint.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-gray-400 text-sm mb-3">{hasDateFilter ? '해당 기간의 정비 기록이 없습니다' : '정비 기록이 없습니다'}</p>
                {isAdmin && !hasDateFilter && (
                  <button onClick={openNewMaint}
                    className="text-blue-600 text-sm font-medium hover:text-blue-700">+ 첫 정비 기록 추가</button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredMaint.map((m: any) => {
                  const cfg = MAINT_TYPE[m.maintenance_type] ?? MAINT_TYPE.other;
                  return (
                    <div key={m.id} className="px-5 py-4 flex items-start gap-4 hover:bg-gray-50 group">
                      {/* 아이콘 */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${cfg.color}`}>
                        {cfg.icon}
                      </div>

                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {format(parseISO(m.maintenance_date), 'yyyy년 MM월 dd일', { locale: ko })}
                          </span>
                          {m.next_maintenance_date && (
                            <span className="text-xs text-orange-500 border border-orange-200 px-2 py-0.5 rounded-full">
                              다음 정비 {format(parseISO(m.next_maintenance_date), 'yyyy.MM.dd')}
                            </span>
                          )}
                        </div>
                        {m.description && (
                          <p className="text-sm text-gray-700 mb-1">{m.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          {m.performed_by && <span>담당: {m.performed_by}</span>}
                          {m.cost != null && <span>비용: {m.cost.toLocaleString()}원</span>}
                          <span>등록: {fmt(m.created_at, 'yyyy.MM.dd')}</span>
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      {isAdmin && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => openEditMaint(m)}
                            className="px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100">수정</button>
                          <button onClick={() => deleteMaint(m)}
                            className="px-2.5 py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50">삭제</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ 정비 등록/수정 모달 ══ */}
      {maintModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">
                {editingMaint ? '정비 기록 수정' : '정비 기록 추가'}
              </h2>
              <button onClick={() => setMaintModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {maintError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{maintError}</div>
              )}

              {/* 정비 유형 */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">정비 유형 *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(MAINT_TYPE).map(([key, cfg]) => (
                    <button key={key} type="button"
                      onClick={() => setMaintForm(p => ({ ...p, maintenance_type: key }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                        maintForm.maintenance_type === key
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      <span>{cfg.icon}</span>{cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 정비 일자 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">정비 일자 *</label>
                  <input type="date" value={maintForm.maintenance_date}
                    onChange={e => setMaintForm(p => ({ ...p, maintenance_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">다음 정비 예정일</label>
                  <input type="date" value={maintForm.next_maintenance_date}
                    onChange={e => setMaintForm(p => ({ ...p, next_maintenance_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* 정비 내용 */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">정비 내용</label>
                <textarea value={maintForm.description} rows={3}
                  onChange={e => setMaintForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="정비 내용을 상세히 기록해주세요"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>

              {/* 담당자 + 비용 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">담당자 / 정비소</label>
                  <input type="text" value={maintForm.performed_by}
                    onChange={e => setMaintForm(p => ({ ...p, performed_by: e.target.value }))}
                    placeholder="예: 현대 공식 서비스센터"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">비용 (원)</label>
                  <input type="number" value={maintForm.cost}
                    onChange={e => setMaintForm(p => ({ ...p, cost: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setMaintModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  취소
                </button>
                <button type="button" onClick={saveMaint} disabled={maintSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60">
                  {maintSaving ? '저장 중...' : (editingMaint ? '수정 완료' : '등록하기')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
