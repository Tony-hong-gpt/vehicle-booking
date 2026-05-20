'use client';

import { useState, useEffect, useCallback } from 'react';
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
  in_progress: { label: '운행 중',   color: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500 animate-pulse' },
  booked:      { label: '배차완료',  color: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-400' },
  maintenance: { label: '정비 중',   color: 'bg-orange-50 text-orange-700', dot: 'bg-orange-400' },
  inactive:    { label: '비운행',    color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-300' },
};

const FUEL_LABELS: Record<string, string> = {
  gasoline: '휘발유', diesel: '경유', electric: '전기', hybrid: '하이브리드',
};

export default function CommitteeVehiclesPage() {
  const [allVehicles, setAllVehicles]     = useState<Vehicle[]>([]);
  const [groups, setGroups]               = useState<VehicleGroup[]>([]);
  const [availableIds, setAvailableIds]   = useState<Set<string> | null>(null);
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());
  const [filterDate, setFilterDate]       = useState('');
  const [checking, setChecking]           = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/vehicle-groups').then(r => r.json()),
      fetch('/api/vehicles?page_size=500').then(r => r.json()),
    ]).then(([g, v]) => {
      setGroups(g.data || []);
      setAllVehicles((v.data || []).filter((v: Vehicle) => v.status !== 'inactive'));
    });
  }, []);

  const checkDate = useCallback(async (date: string) => {
    if (!date) { setAvailableIds(null); setInProgressIds(new Set()); return; }
    setChecking(true);
    try {
      const start = new Date(`${date}T00:00:00`).toISOString();
      const end   = new Date(`${date}T23:59:59`).toISOString();
      const res   = await fetch(`/api/vehicles/available?start_datetime=${start}&end_datetime=${end}`);
      const json  = await res.json();
      setAvailableIds(new Set((json.data || []).map((v: any) => v.id)));
      setInProgressIds(new Set((json.in_progress_ids || []) as string[]));
    } catch {
      setAvailableIds(null); setInProgressIds(new Set());
    } finally { setChecking(false); }
  }, []);

  useEffect(() => { checkDate(filterDate); }, [filterDate, checkDate]);

  function resolveStatus(v: Vehicle): string {
    if (v.status === 'maintenance') return 'maintenance';
    if (availableIds === null) return 'available';
    if (availableIds.has(v.id)) return 'available';
    if (inProgressIds.has(v.id)) return 'in_progress';
    return 'booked';
  }

  const displayVehicles   = allVehicles.map(v => ({ ...v, displayStatus: resolveStatus(v) }));
  const availableCount    = displayVehicles.filter(v => v.displayStatus === 'available').length;
  const bookedCount       = displayVehicles.filter(v => v.displayStatus === 'booked').length;
  const inProgressCount   = displayVehicles.filter(v => v.displayStatus === 'in_progress').length;
  const maintenanceCount  = displayVehicles.filter(v => v.displayStatus === 'maintenance').length;
  const total             = allVehicles.length;

  const byGroup = groups.map(g => ({
    ...g,
    vehicles: displayVehicles.filter(v => v.vehicle_group_id === g.id),
  })).filter(g => g.vehicles.length > 0);

  return (
    <div className="flex flex-col min-h-full pb-28">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">차량 현황</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {filterDate
            ? `${filterDate} 기준 · 사용 가능 ${availableCount} / 전체 ${total}대`
            : `현재 기준 · 사용 가능 ${availableCount} / 전체 ${total}대`}
        </p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">

        {/* 날짜 필터 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">날짜별 가용 확인</p>
          <div className="flex gap-2">
            <input type="date" value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white" />
            {filterDate && (
              <button onClick={() => setFilterDate('')}
                className="px-3 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl bg-gray-50">
                초기화
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {checking ? '🔍 확인 중...'
              : filterDate ? `${filterDate} 00:00 ~ 23:59 기준 예약 현황`
              : '날짜를 선택하면 예약 가능 여부를 확인할 수 있습니다'}
          </p>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-2">
          {(availableIds !== null ? [
            { label: '가용',    count: availableCount,   color: 'text-green-600',  bg: 'bg-green-50' },
            { label: '운행중',  count: inProgressCount,  color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: '배차',    count: bookedCount,      color: 'text-blue-600',   bg: 'bg-blue-50' },
            { label: '정비',    count: maintenanceCount, color: 'text-orange-600', bg: 'bg-orange-50' },
          ] : [
            { label: '가용',    count: availableCount,   color: 'text-green-600',  bg: 'bg-green-50' },
            { label: '정비중',  count: maintenanceCount, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: '전체',    count: total,            color: 'text-gray-700',   bg: 'bg-gray-50' },
            { label: '',        count: null,             color: '',                bg: 'bg-transparent' },
          ]).map((s, i) => s.count !== null ? (
            <div key={i} className={`${s.bg} rounded-2xl p-3 text-center`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ) : <div key={i} />)}
        </div>

        {/* 차량군별 목록 */}
        {byGroup.map(group => (
          <div key={group.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">{group.name}</p>
              <span className="text-xs text-gray-400 font-medium">{group.vehicles.length}대</span>
            </div>
            <div className="divide-y divide-gray-50">
              {group.vehicles.map(v => {
                const cfg = STATUS_CONFIG[v.displayStatus] || STATUS_CONFIG.inactive;
                return (
                  <div key={v.id} className="px-4 py-3.5 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{vehicleName(v)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {v.license_plate} · {v.capacity}인승 · {FUEL_LABELS[v.fuel_type] || v.fuel_type}
                      </p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {byGroup.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25" />
            </svg>
            <p className="text-sm">차량 정보를 불러오는 중...</p>
          </div>
        )}
      </div>
    </div>
  );
}
