'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { vehicleName } from '@/lib/vehicle-utils';

interface VehicleGroup { id: string; name: string; }
interface Vehicle {
  id: string;
  name: string;
  license_plate: string;
  capacity: number;
  fuel_type: string;
  status: string;
  vehicle_group_id: string;
  vehicle_group: { name: string };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  available:   { label: '사용 가능', color: 'bg-green-50 text-green-700',   dot: 'bg-green-400' },
  in_progress: { label: '차량 인수',  color: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500 animate-pulse' },
  booked:      { label: '배차완료',  color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-400' },
  maintenance: { label: '정비 중',   color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-400' },
  inactive:    { label: '비운행',    color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-300' },
};

const FUEL_LABELS: Record<string, string> = {
  gasoline: '휘발유', diesel: '경유', electric: '전기', hybrid: '하이브리드',
};

export default function MobileVehiclesPage() {
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [groups, setGroups] = useState<VehicleGroup[]>([]);
  const [availableIds, setAvailableIds] = useState<Set<string> | null>(null); // null = 날짜 미선택
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());

  // 날짜 필터 (단일 날짜 → 00:00 ~ 23:59)
  const [filterDate, setFilterDate] = useState('');
  const [checking, setChecking] = useState(false);

  // 전체 차량 + 그룹 로드
  useEffect(() => {
    Promise.all([
      fetch('/api/vehicle-groups').then(r => r.json()),
    ]).then(([g]) => {
      setGroups(g.data || []);
    });

    // 전체 차량 (inactive 포함)
    fetch('/api/vehicles?page_size=500').then(r => r.json()).then(json => {
      setAllVehicles((json.data || []).filter((v: Vehicle) => v.status !== 'inactive'));
    });
  }, []);

  // 날짜 선택 시 가용 차량 ID 목록 조회
  const checkDate = useCallback(async (date: string) => {
    if (!date) { setAvailableIds(null); setInProgressIds(new Set()); return; }
    setChecking(true);
    try {
      const start = new Date(`${date}T00:00:00`).toISOString();
      const end   = new Date(`${date}T23:59:59`).toISOString();
      const params = new URLSearchParams({ start_datetime: start, end_datetime: end });
      const res = await fetch(`/api/vehicles/available?${params}`);
      const json = await res.json();
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

  // 차량에 표시할 상태 결정
  function resolveStatus(v: Vehicle): string {
    if (v.status === 'maintenance') return 'maintenance'; // 날짜 무관 항상 정비 중
    if (availableIds === null) return 'available';        // 날짜 미선택 → 정비 외 모두 사용 가능
    if (availableIds.has(v.id)) return 'available';
    if (inProgressIds.has(v.id)) return 'in_progress';
    return 'booked';
  }

  const byGroup = groups.map(g => ({
    ...g,
    vehicles: allVehicles
      .filter(v => v.vehicle_group_id === g.id)
      .map(v => ({ ...v, displayStatus: resolveStatus(v) })),
  })).filter(g => g.vehicles.length > 0);

  const displayVehicles = allVehicles.map(v => ({ ...v, displayStatus: resolveStatus(v) }));
  const availableCount   = displayVehicles.filter(v => v.displayStatus === 'available').length;
  const bookedCount      = displayVehicles.filter(v => v.displayStatus === 'booked').length;
  const inProgressCount  = displayVehicles.filter(v => v.displayStatus === 'in_progress').length;
  const maintenanceCount = displayVehicles.filter(v => v.displayStatus === 'maintenance').length;
  const total = allVehicles.length;

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">차량 현황</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {filterDate
            ? `${format(new Date(filterDate), 'yyyy년 MM월 dd일')} 기준 · 사용 가능 ${availableCount} / 전체 ${total}대`
            : `현재 기준 · 사용 가능 ${availableCount} / 전체 ${total}대`}
        </p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">

        {/* 날짜 필터 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">날짜별 가용 확인</p>
          <div className="flex gap-2 items-center">
            {/* 커스텀 날짜 선택 — 네이티브 input은 숨기고 표시 UI 오버레이 */}
            <div className="relative flex-1 min-w-0 h-11 cursor-pointer">
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="absolute inset-0 flex items-center justify-between px-3 border border-gray-200 rounded-xl bg-white pointer-events-none">
                {filterDate ? (
                  <span className="text-sm text-gray-900 truncate">
                    {format(new Date(filterDate), 'yyyy년 MM월 dd일 (EEE)', { locale: ko })}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">날짜를 선택하세요</span>
                )}
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="flex-shrink-0 px-3 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl bg-gray-50 whitespace-nowrap"
              >
                초기화
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {filterDate
              ? (checking ? '확인 중...' : `${format(new Date(filterDate), 'yyyy-MM-dd')} 00:00 ~ 23:59 기준 예약 현황`)
              : '날짜를 선택하면 예약 가능 여부를 확인할 수 있습니다'}
          </p>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2">
          {(availableIds !== null ? [
            { label: '사용 가능', count: availableCount,   color: 'text-green-600',  bg: 'bg-green-50' },
            { label: '차량 인수',  count: inProgressCount,  color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: '배차완료',  count: bookedCount,      color: 'text-blue-600',   bg: 'bg-blue-50' },
          ] : [
            { label: '사용 가능', count: availableCount,   color: 'text-green-600',  bg: 'bg-green-50' },
            { label: '정비 중',   count: maintenanceCount, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: '전체',      count: total,            color: 'text-gray-600',   bg: 'bg-gray-50' },
          ]).map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 그룹별 차량 목록 */}
        {byGroup.map(group => (
          <div key={group.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">{group.name}</p>
              <span className="text-xs text-gray-400">{group.vehicles.length}대</span>
            </div>
            <div className="divide-y divide-gray-50">
              {group.vehicles.map(v => {
                const cfg = STATUS_CONFIG[v.displayStatus] || STATUS_CONFIG.inactive;
                return (
                  <div key={v.id} className="px-4 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{vehicleName(v)}</p>
                        <p className="text-xs text-gray-400">
                          {v.license_plate} · {v.capacity}인승 · {FUEL_LABELS[v.fuel_type] || v.fuel_type}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
