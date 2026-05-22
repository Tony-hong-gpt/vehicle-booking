'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { vehicleName } from '@/lib/vehicle-utils';

const DISPATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: '배차완료',
  in_progress: '운행중',
  completed: '반납완료',
  cancelled: '취소',
};

const DISPATCH_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
};

export default function DispatchesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<any[]>([]);
  const [totalDispatches, setTotalDispatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [vehicleGroups, setVehicleGroups] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editingDispatch, setEditingDispatch] = useState<any>(null);
  const [isRental, setIsRental] = useState(false);
  const [form, setForm] = useState({
    vehicle_group_id: '',
    vehicle_id: '',
    driver_id: '',
    driver_name: '',
    driver_phone: '',
    scheduled_start: '',
    scheduled_end: '',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 완료(반납완료) 건은 배차 관리에서 제외 — 차량 상세 통계에서 확인
      const dispatchQuery = statusFilter
        ? `/api/dispatches?page_size=200&status=${statusFilter}`
        : `/api/dispatches?page_size=200`;
      const [dispatchRes, approvedRes] = await Promise.all([
        fetch(dispatchQuery),
        fetch('/api/requests?status=approved&page_size=100'),
      ]);
      const dispatchData = await dispatchRes.json();
      const approvedData = await approvedRes.json();
      // 필터 없을 때 완료 건 제외
      const allDispatches: any[] = dispatchData.data || [];
      // 전체: 반납완료(completed)만 제외 — 배차완료·운행중·취소 모두 표시
      const activeDispatches = statusFilter
        ? allDispatches
        : allDispatches.filter((d: any) => d.status !== 'completed');
      setDispatches(activeDispatches);
      setTotalDispatches(activeDispatches.length);
      setApprovedRequests(approvedData.data || []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // UTC ISO 문자열을 브라우저 로컬 시간의 datetime-local 입력 형식으로 변환
  // (slice(0,16) 방식은 UTC 시간을 로컬로 착각하는 버그 발생 → Date 객체 경유)
  const utcToLocalInput = (utcIso: string) => {
    const d = new Date(utcIso);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openDispatchModal = async (req: any) => {
    setSelectedRequest(req);
    setError('');
    setIsRental(false);
    const initGroupId = req.vehicle_group_id || '';
    setForm({
      vehicle_group_id: initGroupId,
      vehicle_id: '',
      driver_id: '',
      driver_name: req.driver_name || '',
      driver_phone: req.driver_phone || '',
      scheduled_start: req.start_datetime ? utcToLocalInput(req.start_datetime) : '',
      scheduled_end: req.end_datetime ? utcToLocalInput(req.end_datetime) : '',
      notes: '',
    });
    // fetch vehicle groups + available vehicles
    const [vgRes, vRes] = await Promise.all([
      fetch('/api/vehicle-groups'),
      fetch(`/api/vehicles?page_size=500&status=available${initGroupId ? `&vehicle_group_id=${initGroupId}` : ''}`),
    ]);
    const vgData = await vgRes.json();
    const vData = await vRes.json();
    setVehicleGroups(vgData.data || []);
    const fetchedVehicles = vData.data || [];
    setAllVehicles(fetchedVehicles);
    setVehicles(fetchedVehicles);
    setShowModal(true);
  };

  // 차량군 변경 시 해당 군의 차량만 표시
  const handleGroupChange = async (groupId: string) => {
    setForm(f => ({ ...f, vehicle_group_id: groupId, vehicle_id: '', driver_id: '' }));
    const url = groupId
      ? `/api/vehicles?page_size=500&status=available&vehicle_group_id=${groupId}`
      : `/api/vehicles?page_size=500&status=available`;
    const res = await fetch(url);
    const data = await res.json();
    setVehicles(data.data || []);
  };

  // 선택된 차량군이 버스 계열인지 확인
  const isBusGroup = (groupId: string) => {
    const g = vehicleGroups.find((x: any) => x.id === groupId);
    return g ? g.name.includes('버스') : false;
  };

  const openEditModal = async (dispatch: any) => {
    setEditingDispatch(dispatch);
    setSelectedRequest(dispatch.request);
    setError('');
    const rental = dispatch.is_rental || false;
    setIsRental(rental);
    const initGroupId = dispatch.request?.vehicle_group_id || '';
    setForm({
      vehicle_group_id: initGroupId,
      vehicle_id: dispatch.vehicle_id || '',
      driver_id: dispatch.driver_id || '',
      driver_name: dispatch.driver_name || '',
      driver_phone: dispatch.driver_phone || '',
      scheduled_start: dispatch.scheduled_start ? utcToLocalInput(dispatch.scheduled_start) : '',
      scheduled_end: dispatch.scheduled_end ? utcToLocalInput(dispatch.scheduled_end) : '',
      notes: dispatch.notes || '',
    });
    const [vgRes, vRes] = await Promise.all([
      fetch('/api/vehicle-groups'),
      fetch(`/api/vehicles?page_size=500${initGroupId ? `&vehicle_group_id=${initGroupId}` : ''}`),
    ]);
    const vgData = await vgRes.json();
    const vData = await vRes.json();
    setVehicleGroups(vgData.data || []);
    // 사용 가능한 차량 + 현재 배차된 차량 포함
    const all = (vData.data || []) as any[];
    const filtered = all.filter((v: any) => v.status === 'available' || v.id === dispatch.vehicle_id);
    setAllVehicles(filtered);
    setVehicles(filtered);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedRequest(null);
    setEditingDispatch(null);
    setError('');
    setIsRental(false);
  };

  const handleSubmit = async () => {
    if (!form.scheduled_start) { setError('출발 일시를 입력해주세요'); return; }
    if (!form.scheduled_end) { setError('반납 일시를 입력해주세요'); return; }
    if (new Date(form.scheduled_end) <= new Date(form.scheduled_start)) {
      setError('반납 일시는 출발 일시보다 이후여야 합니다'); return;
    }
    if (!isRental && !form.vehicle_id) { setError('차량을 선택해주세요'); return; }

    // 비버스 + 비대차: 운전기사 이름 필수
    if (!isRental && !isBusGroup(form.vehicle_group_id) && !form.driver_name.trim()) {
      setError('운전기사 이름을 입력해주세요'); return;
    }

    setSubmitting(true);
    setError('');
    try {
      let res: Response;
      if (editingDispatch) {
        // 배차 수정 (차량 교체)
        res = await fetch(`/api/dispatches/${editingDispatch.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_id: isRental ? null : (form.vehicle_id || undefined),
            driver_name: form.driver_name.trim() || null,
            driver_phone: form.driver_phone.trim() || null,
            scheduled_start: new Date(form.scheduled_start).toISOString(),
            scheduled_end: new Date(form.scheduled_end).toISOString(),
            notes: form.notes || undefined,
            is_rental: isRental,
          }),
        });
      } else {
        // 신규 배차
        res = await fetch('/api/dispatches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: selectedRequest.id,
            vehicle_id: isRental ? null : form.vehicle_id,
            driver_id: null,
            driver_name: form.driver_name.trim() || null,
            driver_phone: form.driver_phone.trim() || null,
            scheduled_start: new Date(form.scheduled_start).toISOString(),
            scheduled_end: new Date(form.scheduled_end).toISOString(),
            notes: form.notes || undefined,
            is_rental: isRental,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setError(data.error || '처리에 실패했습니다'); return; }
      closeModal();
      fetchData();
    } finally {
      setSubmitting(false);
    }
  };

  const statusOptions = [
    { value: '', label: '전체' },
    { value: 'scheduled', label: '배차완료' },
    { value: 'in_progress', label: '운행중' },
    { value: 'cancelled', label: '취소' },
  ];

  return (
    <div className="p-6">
      {/* 배차 대기 섹션 */}
      {approvedRequests.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-lg font-bold text-gray-900">배차 대기</h2>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {approvedRequests.length}건
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {approvedRequests.map((req: any) => (
              <div
                key={req.id}
                className="bg-white border border-amber-100 rounded-2xl p-5 flex items-center justify-between shadow-sm hover:shadow-md hover:border-amber-200 transition-all"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-gray-400">{req.request_no}</span>
                      {req.requester?.name && <><span className="text-gray-200">·</span><span className="text-sm text-gray-500">{req.requester.name}</span></>}
                      {req.department?.name && <><span className="text-gray-200">·</span><span className="text-sm text-gray-400">{req.department.name}</span></>}
                    </div>
                    <p className="font-semibold text-gray-900 truncate">{req.destination}</p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {req.start_datetime && format(new Date(req.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })}
                      {' ~ '}
                      {req.end_datetime && format(new Date(req.end_datetime), 'MM.dd(EEE) HH:mm', { locale: ko })}
                    </p>
                    {req.vehicle_group?.name && (
                      <p className="text-xs text-gray-400 mt-0.5">{req.vehicle_group.name} · {req.passengers}명</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openDispatchModal(req)}
                  className="ml-4 flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-sm"
                >
                  배차 처리
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 배차 현황 섹션 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">배차 현황</h1>
          <p className="text-gray-400 mt-1 text-sm">총 <span className="font-semibold text-gray-600">{totalDispatches}건</span></p>
        </div>
      </div>

      {/* 상태 필터 */}
      <div className="flex gap-1.5 mb-5">
        {statusOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
              statusFilter === opt.value
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">신청번호</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">목적지</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">신청자</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">배차 차량</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">운전기사</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">출발 예정</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-500">상태</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-gray-400 text-sm">불러오는 중...</td>
              </tr>
            )}
            {!loading && dispatches.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-gray-400 text-sm">
                  {approvedRequests.length > 0
                    ? '위의 승인된 신청을 배차 처리해주세요'
                    : '배차 내역이 없습니다'}
                </td>
              </tr>
            )}
            {dispatches.map((d: any) => {
              const isCancelled = d.status === 'cancelled';
              return (
              <tr key={d.id} className={`transition-colors ${isCancelled ? 'bg-gray-50/60 opacity-70' : 'hover:bg-gray-50/70'}`}>
                <td className="px-5 py-4 font-mono text-xs text-gray-400">{d.request?.request_no}</td>
                <td className={`px-5 py-4 font-semibold text-sm ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {d.request?.destination}
                </td>
                <td className="px-5 py-4 text-gray-500 text-sm">{d.request?.requester?.name}</td>
                <td className="px-5 py-4">
                  {d.is_rental ? (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isCancelled ? 'bg-gray-100 text-gray-400' : 'bg-amber-50 text-amber-700'}`}>
                      대차
                    </span>
                  ) : (
                    <>
                      <div className={`font-semibold text-sm ${isCancelled ? 'text-gray-400' : 'text-gray-900'}`}>{vehicleName(d.vehicle)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{d.vehicle?.license_plate}</div>
                    </>
                  )}
                </td>
                <td className="px-5 py-4 text-gray-500 text-sm">
                  {d.driver?.user?.name || d.driver_name || <span className="text-gray-300">직접 운행</span>}
                </td>
                <td className="px-5 py-4 text-gray-500 text-sm whitespace-nowrap">
                  {d.scheduled_start && format(new Date(d.scheduled_start), 'yy.MM.dd(EEE) HH:mm', { locale: ko })}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${DISPATCH_STATUS_COLORS[d.status] || 'bg-gray-100 text-gray-600'}`}>
                      {DISPATCH_STATUS_LABELS[d.status] || d.status}
                    </span>
                    {/* 신청 취소로 인한 배차 취소임을 명시 */}
                    {isCancelled && d.request?.status === 'cancelled' && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-rose-50 text-rose-500 rounded-full text-[10px] font-medium">
                        신청취소
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-right">
                  {['scheduled', 'in_progress'].includes(d.status) && (
                    <button
                      onClick={() => openEditModal(d)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      차량 변경
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* 배차 처리 모달 */}
      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingDispatch ? '배차 수정' : '배차 처리'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* 신청 정보 */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-xs text-gray-400">{selectedRequest.request_no}</span>
                </div>
                <p className="font-semibold text-gray-900 text-base">{selectedRequest.destination}</p>
                <p className="text-sm text-gray-500 mt-1">
                  신청자: {selectedRequest.requester?.name}
                  {selectedRequest.department?.name && ` · ${selectedRequest.department.name}`}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">
                  탑승: {selectedRequest.passengers}명
                  {selectedRequest.vehicle_group?.name && ` · 차량군: ${selectedRequest.vehicle_group.name}`}
                </p>
                <p className="text-sm text-blue-600 font-medium mt-1.5">
                  {selectedRequest.start_datetime && format(new Date(selectedRequest.start_datetime), 'yyyy.MM.dd(EEE) HH:mm', { locale: ko })}
                  {' ~ '}
                  {selectedRequest.end_datetime && format(new Date(selectedRequest.end_datetime), 'MM.dd(EEE) HH:mm', { locale: ko })}
                </p>
              </div>

              {/* 대차 토글 */}
              <div className={`rounded-xl border-2 p-4 transition-colors cursor-pointer ${isRental ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}
                onClick={() => { setIsRental(r => !r); setForm(f => ({ ...f, vehicle_id: '' })); }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-semibold text-sm ${isRental ? 'text-amber-700' : 'text-gray-700'}`}>
                      🚐 외부 대차
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">내부 차량이 없어 외부 차량을 임차하는 경우</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 flex items-center px-1 ${isRental ? 'bg-amber-400' : 'bg-gray-200'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${isRental ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>

              {/* 차량군 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">차량군</label>
                <select
                  value={form.vehicle_group_id}
                  onChange={e => handleGroupChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">전체 차량군</option>
                  {vehicleGroups.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {g.id === selectedRequest?.vehicle_group_id ? ' (신청 차량군)' : ''}
                    </option>
                  ))}
                </select>
                {form.vehicle_group_id && form.vehicle_group_id !== selectedRequest?.vehicle_group_id && (
                  <p className="mt-1 text-xs text-amber-600">
                    ⚠ 신청자가 요청한 차량군과 다른 차량군입니다
                  </p>
                )}
              </div>

              {/* 배차 차량 선택 — 대차면 안내 텍스트만 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  배차 차량 {!isRental && <span className="text-red-500">*</span>}
                </label>
                {isRental ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 font-medium">
                    🚐 외부 대차 — 내부 차량 미배정
                  </div>
                ) : vehicles.length === 0 ? (
                  <div className="text-sm text-gray-400 bg-gray-50 rounded-lg p-3 text-center">
                    {form.vehicle_group_id ? '해당 차량군에 사용 가능한 차량이 없습니다' : '사용 가능한 차량이 없습니다'}
                  </div>
                ) : (
                  <select
                    value={form.vehicle_id}
                    onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">차량 선택</option>
                    {vehicles.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {vehicleName(v)} ({v.license_plate})
                        {v.capacity ? ` · ${v.capacity}인승` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {!isRental && <p className="mt-1 text-xs text-gray-400">현재 사용 가능한 차량만 표시됩니다</p>}
              </div>

              {/* 운전기사 — 모든 차량군 텍스트 입력 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  운전기사
                  {!isRental && !isBusGroup(form.vehicle_group_id) && (
                    <span className="text-red-500"> *</span>
                  )}
                  {form.vehicle_group_id && isBusGroup(form.vehicle_group_id) && (
                    <span className="ml-2 text-xs text-blue-500 font-normal">차량위 지정 (선택)</span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder={
                    isBusGroup(form.vehicle_group_id)
                      ? '기사 이름 (차량위에서 지정하는 경우 생략 가능)'
                      : isRental
                      ? '기사 이름 (선택)'
                      : '운전기사 이름을 입력하세요'
                  }
                  value={form.driver_name}
                  onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  placeholder="운전기사 연락처 (선택, 예: 010-1234-5678)"
                  value={form.driver_phone}
                  onChange={e => setForm(f => ({ ...f, driver_phone: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 출발 일시 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    출발 일시 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.scheduled_start}
                    onChange={e => setForm(f => ({ ...f, scheduled_start: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    반납 일시 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={form.scheduled_end}
                    onChange={e => setForm(f => ({ ...f, scheduled_end: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">메모</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="특이사항이 있으면 입력하세요"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* 에러 메시지 */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || (!isRental && !form.vehicle_id)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting ? '처리 중...' : editingDispatch ? '수정 완료' : '배차 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
