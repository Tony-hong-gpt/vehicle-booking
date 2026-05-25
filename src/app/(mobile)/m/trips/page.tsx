'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { vehicleName } from '@/lib/vehicle-utils';

interface TripDispatch {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start?: string;
  driver_name?: string;
  is_rental?: boolean;
  notes?: string;
  vehicle?: { id: string; name: string; model?: string | null; license_plate: string; fuel_type: string; current_mileage?: number };
  request?: {
    id: string;
    request_no: string;
    destination: string;
    purpose?: { name: string };
    passengers: number;
    requester?: { name: string };
  };
}

interface PendingRequest {
  id: string;
  request_no: string;
  destination: string;
  status: string;
  start_datetime: string;
  end_datetime: string;
  passengers?: number;
  purpose?: { name: string };
  vehicle_group?: { name: string };
}

const STATUS_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  upper_approved: { label: '위원회 승인 완료 · 배차 대기', color: 'text-blue-700',  dot: 'bg-blue-400' },
  approved:       { label: '최종 승인 완료 · 배차 대기',   color: 'text-green-700', dot: 'bg-green-400' },
};

export default function MobileTripsPage() {
  const [trips,          setTrips]          = useState<TripDispatch[]>([]);
  const [completedTrips, setCompletedTrips] = useState<TripDispatch[]>([]);
  const [pendingReqs,    setPendingReqs]    = useState<PendingRequest[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [actionLoading,  setActionLoading]  = useState<string | null>(null);

  /* 인수 모달 */
  const [pickupModal,   setPickupModal]   = useState<TripDispatch | null>(null);
  const [pickupMileage, setPickupMileage] = useState('');
  const [pickupError,   setPickupError]   = useState('');

  /* 반납 모달 */
  const [returnModal, setReturnModal] = useState<TripDispatch | null>(null);
  const [returnForm,  setReturnForm]  = useState({ end_mileage: '', fuel_level: 'full', notes: '' });
  const [returnError, setReturnError] = useState('');

  const [successMsg, setSuccessMsg] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [res1, res2, res3, res4, res5] = await Promise.all([
        fetch('/api/dispatches?my_trips=true&status=in_progress&page_size=50'),
        fetch('/api/dispatches?my_trips=true&status=scheduled&page_size=50'),
        fetch('/api/requests?status=upper_approved&page_size=50'),
        fetch('/api/requests?status=approved&page_size=50'),
        fetch('/api/dispatches?my_trips=true&status=completed&page_size=10'),
      ]);
      const [j1, j2, j3, j4, j5] = await Promise.all([res1.json(), res2.json(), res3.json(), res4.json(), res5.json()]);
      setTrips([...(j1.data || []), ...(j2.data || [])]);
      const combined: PendingRequest[] = [...(j3.data || []), ...(j4.data || [])].sort(
        (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
      );
      setPendingReqs(combined);
      setCompletedTrips(j5.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* 인수 확인 모달 열기 */
  const openPickupModal = (dispatch: TripDispatch) => {
    setPickupModal(dispatch);
    setPickupMileage(dispatch.vehicle?.current_mileage?.toString() ?? '');
    setPickupError('');
  };

  /* 인수 확인 처리 */
  const handlePickupConfirm = async () => {
    if (!pickupModal) return;
    const mileageNum = Number(pickupMileage);
    if (pickupMileage && (isNaN(mileageNum) || mileageNum < 0)) {
      setPickupError('올바른 주행거리를 입력해주세요');
      return;
    }
    setActionLoading(pickupModal.id);
    setPickupError('');
    try {
      const body: Record<string, unknown> = {};
      if (pickupMileage) body.start_mileage = mileageNum;

      const res = await fetch(`/api/dispatches/${pickupModal.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setPickupError(json.error || '처리에 실패했습니다'); return; }
      setPickupModal(null);
      setPickupMileage('');
      setSuccessMsg('차량 인수가 확인되었습니다. 안전 운행하세요!');
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchAll();
    } finally {
      setActionLoading(null);
    }
  };

  /* 반납 처리 */
  const handleReturn = async () => {
    if (!returnModal) return;
    if (!returnForm.end_mileage) { setReturnError('반납 주행거리를 입력해주세요'); return; }
    setActionLoading(returnModal.id);
    setReturnError('');
    try {
      const res = await fetch(`/api/dispatches/${returnModal.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          end_mileage: Number(returnForm.end_mileage),
          fuel_level: returnForm.fuel_level,
          notes: returnForm.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setReturnError(json.error || '처리에 실패했습니다'); return; }
      setReturnModal(null);
      setReturnForm({ end_mileage: '', fuel_level: 'full', notes: '' });
      setSuccessMsg('반납이 완료되었습니다. 감사합니다!');
      setTimeout(() => setSuccessMsg(''), 4000);
      fetchAll();
    } finally {
      setActionLoading(null);
    }
  };

  const inProgress = trips.filter(t => t.status === 'in_progress');
  const scheduled  = trips.filter(t => t.status === 'scheduled');
  const isEmpty    = inProgress.length === 0 && scheduled.length === 0 && pendingReqs.length === 0 && completedTrips.length === 0;

  return (
    <div className="flex flex-col min-h-full pb-20">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">운행 관리</h1>
        <p className="text-xs text-gray-400 mt-0.5">차량 인수 및 반납을 처리합니다</p>
      </div>

      {successMsg && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-green-700 font-medium">{successMsg}</p>
        </div>
      )}

      <div className="flex-1 px-4 py-4 space-y-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">진행 중인 차량 신청이 없습니다</p>
            <p className="text-gray-300 text-xs">승인된 신청 및 배차 내역이 여기에 표시됩니다</p>
          </div>
        ) : (
          <>
            {/* 운행 중 */}
            {inProgress.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  <h2 className="text-sm font-bold text-gray-800">운행 중</h2>
                  <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                    {inProgress.length}건
                  </span>
                </div>
                <div className="space-y-3">
                  {inProgress.map(trip => (
                    <TripCard key={trip.id} trip={trip}
                      onReturn={() => {
                        setReturnModal(trip);
                        setReturnError('');
                        setReturnForm({ end_mileage: '', fuel_level: 'full', notes: '' });
                      }}
                      loading={actionLoading === trip.id} />
                  ))}
                </div>
              </section>
            )}

            {/* 인수 대기 */}
            {scheduled.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <h2 className="text-sm font-bold text-gray-800">인수 대기</h2>
                  <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                    {scheduled.length}건
                  </span>
                </div>
                <div className="space-y-3">
                  {scheduled.map(trip => (
                    <TripCard key={trip.id} trip={trip}
                      onPickup={() => openPickupModal(trip)}
                      loading={actionLoading === trip.id} />
                  ))}
                </div>
              </section>
            )}

            {/* 배차 대기 */}
            {pendingReqs.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <h2 className="text-sm font-bold text-gray-800">배차 대기</h2>
                  <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">
                    {pendingReqs.length}건
                  </span>
                </div>
                <div className="space-y-3">
                  {pendingReqs.map(req => {
                    const cfg = STATUS_LABEL[req.status];
                    return (
                      <div key={req.id} className="bg-white rounded-2xl border border-amber-100 overflow-hidden shadow-sm">
                        <div className="bg-amber-50 px-4 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dot ?? 'bg-gray-300'}`} />
                            <span className={`text-xs font-bold ${cfg?.color ?? 'text-gray-500'}`}>
                              {cfg?.label ?? req.status}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{format(new Date(req.start_datetime), 'MM.dd HH:mm', { locale: ko })}</span>
                        </div>
                        <div className="px-4 py-3.5">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <p className="font-bold text-gray-900 text-base">{req.destination}</p>
                            {req.passengers && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full flex-shrink-0">
                                {req.passengers}명
                              </span>
                            )}
                          </div>
                          <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-400 w-14">출발</span>
                              <span className="font-medium text-gray-700">
                                {format(new Date(req.start_datetime), 'MM.dd(EEE) HH:mm', { locale: ko })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-400 w-14">반납 예정</span>
                              <span className="font-medium text-gray-700">
                                {format(new Date(req.end_datetime), 'MM.dd(EEE) HH:mm', { locale: ko })}
                              </span>
                            </div>
                            {req.purpose?.name && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-400 w-14">목적</span>
                                <span className="font-medium text-gray-700">{req.purpose.name}</span>
                              </div>
                            )}
                            {req.vehicle_group?.name && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-400 w-14">차량군</span>
                                <span className="font-medium text-gray-700">{req.vehicle_group.name}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            담당자가 차량을 배차하면 여기에 표시됩니다
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 완료된 운행 */}
            {completedTrips.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <h2 className="text-sm font-bold text-gray-800">완료된 운행</h2>
                  <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">
                    최근 {completedTrips.length}건
                  </span>
                </div>
                <div className="space-y-2.5">
                  {completedTrips.map(trip => (
                    <div key={trip.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm opacity-70">
                      <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          <span className="text-xs font-bold text-gray-400">반납 완료</span>
                        </div>
                        <span className="text-xs text-gray-400">{trip.actual_start ? format(new Date(trip.actual_start), 'MM.dd HH:mm', { locale: ko }) : '-'}</span>
                      </div>
                      <div className="px-4 py-3">
                        <p className="font-bold text-gray-700 text-sm mb-2">{trip.request?.destination}</p>
                        <div className="bg-gray-50 rounded-xl px-3 py-2 space-y-1">
                          {trip.vehicle && (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-400 w-14">차량</span>
                              <span className="font-medium text-gray-600">{vehicleName(trip.vehicle)} ({trip.vehicle.license_plate})</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400 w-14">출발</span>
                            <span className="font-medium text-gray-600">
                              {format(new Date(trip.scheduled_start), 'MM.dd(EEE) HH:mm', { locale: ko })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400 w-14">반납</span>
                            <span className="font-medium text-gray-600">
                              {format(new Date(trip.scheduled_end), 'MM.dd(EEE) HH:mm', { locale: ko })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ── 인수 확인 모달 ── */}
      {pickupModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end">
          <div className="bg-white rounded-t-3xl w-full max-w-md mx-auto p-5 pb-28 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">차량 인수 확인</h3>
              <button onClick={() => setPickupModal(null)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>

            {/* 차량 정보 */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-4">
              <p className="font-semibold text-blue-900">{vehicleName(pickupModal.vehicle)}</p>
              <p className="text-xs text-blue-500 mt-0.5">{pickupModal.vehicle?.license_plate}</p>
              {pickupModal.vehicle?.current_mileage !== undefined && (
                <div className="mt-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="text-xs text-blue-600">
                    등록 주행거리: <span className="font-semibold">{pickupModal.vehicle.current_mileage.toLocaleString()} km</span>
                  </span>
                </div>
              )}
            </div>

            {pickupError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 mb-3">
                {pickupError}
              </div>
            )}

            {/* 출발 주행거리 입력 */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                출발 주행거리 (km)
                <span className="ml-1.5 text-gray-400 font-normal">· 차량 계기판 확인 후 입력</span>
              </label>
              <input
                type="number"
                value={pickupMileage}
                onChange={e => setPickupMileage(e.target.value)}
                placeholder={pickupModal.vehicle?.current_mileage
                  ? `현재 ${pickupModal.vehicle.current_mileage.toLocaleString()} km`
                  : '예: 62100'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                출발 전 차량 계기판의 주행거리를 입력해주세요.<br />
                미입력 시 주행거리 기록이 불완전할 수 있습니다.
              </p>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setPickupModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium">
                취소
              </button>
              <button
                onClick={handlePickupConfirm}
                disabled={actionLoading === pickupModal.id}
                className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {actionLoading === pickupModal.id ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                차량 인수 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 반납 모달 ── */}
      {returnModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-end">
          <div className="bg-white rounded-t-3xl w-full max-w-md mx-auto p-5 pb-28 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">반납 완료</h3>
              <button onClick={() => setReturnModal(null)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 mb-4 text-sm text-gray-600">
              <p className="font-semibold text-gray-800">{vehicleName(returnModal.vehicle)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{returnModal.vehicle?.license_plate}</p>
            </div>
            {returnError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600 mb-3">
                {returnError}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  반납 주행거리 (km) <span className="text-red-500">*</span>
                  <span className="ml-1.5 text-gray-400 font-normal">· 차량 계기판 확인 후 입력</span>
                </label>
                <input
                  type="number"
                  value={returnForm.end_mileage}
                  onChange={e => setReturnForm(p => ({ ...p, end_mileage: e.target.value }))}
                  placeholder="예: 62500"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">연료 상태</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'full', label: '가득' },
                    { value: '3/4',  label: '3/4' },
                    { value: '1/2',  label: '1/2' },
                    { value: '1/4',  label: '1/4' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setReturnForm(p => ({ ...p, fuel_level: opt.value }))}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                        returnForm.fuel_level === opt.value
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-200 text-gray-500'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">특이사항 (선택)</label>
                <textarea
                  value={returnForm.notes}
                  onChange={e => setReturnForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="차량 상태, 주의사항 등"
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <button
              onClick={handleReturn}
              disabled={actionLoading === returnModal.id}
              className="w-full mt-4 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-semibold text-sm disabled:opacity-60 transition-colors">
              {actionLoading === returnModal.id ? '처리 중...' : '반납 완료 확인'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TripCard({
  trip, onPickup, onReturn, loading,
}: {
  trip: TripDispatch;
  onPickup?: () => void;
  onReturn?: () => void;
  loading?: boolean;
}) {
  const isInProgress = trip.status === 'in_progress';
  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${
      isInProgress ? 'border-purple-200' : 'border-blue-100'
    }`}>
      <div className={`px-4 py-2 flex items-center justify-between ${
        isInProgress ? 'bg-purple-50' : 'bg-blue-50'
      }`}>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isInProgress ? 'bg-purple-500 animate-pulse' : 'bg-blue-400'}`} />
          <span className={`text-xs font-bold ${isInProgress ? 'text-purple-700' : 'text-blue-700'}`}>
            {isInProgress ? '운행 중' : '인수 대기'}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          {trip.request?.start_datetime ? format(new Date(trip.request.start_datetime), 'MM.dd HH:mm', { locale: ko }) : '-'}
        </span>
      </div>

      <div className="px-4 py-3.5">
        <p className="font-bold text-gray-900 text-base">{trip.request?.destination}</p>
        {trip.request?.purpose?.name && (
          <p className="text-xs text-gray-400 mt-0.5">{trip.request.purpose.name}</p>
        )}

        {trip.vehicle && !trip.is_rental ? (
          <div className="mt-3 flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-800">{vehicleName(trip.vehicle)}</p>
                <p className="text-xs text-gray-400">{trip.vehicle.license_plate}</p>
              </div>
            </div>
            {trip.vehicle.current_mileage !== undefined && (
              <span className="text-xs text-gray-400 font-mono">
                {trip.vehicle.current_mileage.toLocaleString()} km
              </span>
            )}
          </div>
        ) : trip.is_rental ? (
          <div className="mt-3 flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2">
            <span className="text-sm">🚐</span>
            <p className="text-sm font-semibold text-amber-700">대차 배정</p>
          </div>
        ) : null}

        <div className="mt-3 space-y-1 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="text-gray-300 w-14">출발</span>
            <span className="font-medium text-gray-700">
              {format(new Date(trip.scheduled_start), 'MM.dd(EEE) HH:mm', { locale: ko })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-300 w-14">반납 예정</span>
            <span className="font-medium text-gray-700">
              {format(new Date(trip.scheduled_end), 'MM.dd(EEE) HH:mm', { locale: ko })}
            </span>
          </div>
          {isInProgress && trip.actual_start && (
            <div className="flex items-center gap-2">
              <span className="text-gray-300 w-14">인수 시각</span>
              <span className="font-medium text-purple-600">
                {format(new Date(trip.actual_start), 'MM.dd(EEE) HH:mm', { locale: ko })}
              </span>
            </div>
          )}
          {trip.driver_name && (
            <div className="flex items-center gap-2">
              <span className="text-gray-300 w-14">운전기사</span>
              <span className="font-medium text-gray-700">{trip.driver_name}</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          {!isInProgress && onPickup && (() => {
            const departureMs   = new Date(trip.scheduled_start).getTime();
            const nowMs         = Date.now();
            const canPickup     = departureMs - nowMs <= 24 * 60 * 60 * 1000; // 출발 24시간 이내
            const availableTime = new Date(departureMs - 24 * 60 * 60 * 1000);
            const availableStr  = format(availableTime, 'M/d(EEE) HH:mm', { locale: ko });

            return canPickup ? (
              <button onClick={onPickup} disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                차량 인수 확인
              </button>
            ) : (
              <div className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-gray-500">출발 24시간 전부터 인수 가능</p>
                  <p className="text-xs text-gray-400 mt-0.5">{availableStr} 이후 인수할 수 있습니다</p>
                </div>
              </div>
            );
          })()}
          {isInProgress && onReturn && (
            <button onClick={onReturn} disabled={loading}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              반납 완료
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
