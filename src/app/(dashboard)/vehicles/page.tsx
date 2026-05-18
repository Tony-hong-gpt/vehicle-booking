'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { FUEL_TYPE_LABELS } from '@/lib/constants';
import { vehicleName } from '@/lib/vehicle-utils';

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

  const today = format(new Date(), 'yyyy-MM-dd');

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

  return (
    <div className="p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">차량 현황</h1>
          <p className="text-gray-500 mt-1 text-sm">총 {vehicles.length}대</p>
        </div>
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
                  <div className="space-y-1.5">
                    <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">{vehicleName(v)}</h3>
                    <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-md font-mono tracking-widest shadow-sm">
                      <svg className="w-3 h-3 opacity-70" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-5h14v5z"/>
                        <circle cx="7.5" cy="14.5" r="1.5"/>
                        <circle cx="16.5" cy="14.5" r="1.5"/>
                      </svg>
                      {v.license_plate}
                    </span>
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
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
