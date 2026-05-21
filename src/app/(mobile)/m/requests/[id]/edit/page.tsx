'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface SelectOption { id: string; name: string; }

const DIRECT_INPUT_VALUE = '__direct__';

export default function MobileRequestEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [purposes, setPurposes] = useState<SelectOption[]>([]);
  const [vehicleGroups, setVehicleGroups] = useState<SelectOption[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);
  const [groupAvailability, setGroupAvailability] = useState<Record<string, boolean | null>>({});
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const [purposeMode, setPurposeMode] = useState<'select' | 'direct'>('select');
  const [purposeId, setPurposeId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState('');

  const [form, setForm] = useState({
    custom_purpose: '',
    destination: '',
    passengers: 1,
    start_datetime: '',
    end_datetime: '',
    reason: '',
    driver_name: '',
    driver_phone: '',
  });

  // params 처리
  useEffect(() => { params.then(p => setId(p.id)); }, [params]);

  // 기존 신청 데이터 + 마스터 데이터 로드
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/requests/${id}`).then(r => r.json()),
      fetch('/api/purposes').then(r => r.json()),
      fetch('/api/vehicle-groups').then(r => r.json()),
      fetch('/api/user-departments').then(r => r.json()),
    ]).then(([reqJson, purpJson, grpJson, deptJson]) => {
      const req = reqJson.data;
      if (!req) { setError('신청을 찾을 수 없습니다'); setInitialLoading(false); return; }
      if (!['pending', 'on_hold', 'rejected'].includes(req.status)) {
        setError('이 상태에서는 수정할 수 없습니다'); setInitialLoading(false); return;
      }

      setPurposes(purpJson.data || []);
      setVehicleGroups(grpJson.data || []);
      setDepartments(deptJson.data || []);

      // 기존 값 채우기
      if (req.purpose_id) { setPurposeMode('select'); setPurposeId(req.purpose_id); }
      else if (req.custom_purpose) { setPurposeMode('direct'); }
      setDepartmentId(req.department_id || '');
      setSelectedGroupIds(req.vehicle_group_id ? [req.vehicle_group_id] : []);

      // datetime-local 포맷: "yyyy-MM-ddTHH:mm"
      const toLocal = (iso: string) => iso ? iso.slice(0, 16) : '';

      setForm({
        custom_purpose: req.custom_purpose || '',
        destination: req.destination || '',
        passengers: req.passengers || 1,
        start_datetime: toLocal(req.start_datetime),
        end_datetime: toLocal(req.end_datetime),
        reason: req.reason || '',
        driver_name: req.driver_name || '',
        driver_phone: req.driver_phone || '',
      });
      setInitialLoading(false);
    });
  }, [id]);

  // 날짜 변경 시 차량군별 가용 여부 확인
  const checkGroupAvailability = useCallback(async () => {
    if (!form.start_datetime || !form.end_datetime || vehicleGroups.length === 0) {
      setGroupAvailability({});
      return;
    }
    if (new Date(form.end_datetime) <= new Date(form.start_datetime)) {
      setGroupAvailability({});
      return;
    }
    setCheckingAvailability(true);
    const startISO = new Date(form.start_datetime).toISOString();
    const endISO   = new Date(form.end_datetime).toISOString();

    const results = await Promise.all(
      vehicleGroups.map(async g => {
        const params = new URLSearchParams({ start_datetime: startISO, end_datetime: endISO, vehicle_group_id: g.id });
        try {
          const res = await fetch(`/api/vehicles/available?${params}`);
          const json = await res.json();
          return { id: g.id, available: (json.data || []).length > 0 };
        } catch {
          return { id: g.id, available: true };
        }
      })
    );
    const map: Record<string, boolean> = {};
    results.forEach(r => { map[r.id] = r.available; });
    setGroupAvailability(map);
    setSelectedGroupIds(prev => prev.filter(gid => map[gid] !== false));
    setCheckingAvailability(false);
  }, [form.start_datetime, form.end_datetime, vehicleGroups]);

  useEffect(() => { checkGroupAvailability(); }, [checkGroupAvailability]);

  function toggleGroup(gid: string) {
    if (groupAvailability[gid] === false) return;
    setSelectedGroupIds(prev =>
      prev.includes(gid) ? prev.filter(g => g !== gid) : [...prev, gid]
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'passengers' ? Number(value) : value }));
  }

  async function handleSubmit() {
    setError('');
    if (purposeMode === 'select' && !purposeId) { setError('사용목적을 선택해주세요'); return; }
    if (purposeMode === 'direct' && !form.custom_purpose.trim()) { setError('사용목적을 입력해주세요'); return; }
    if (!departmentId) { setError('소속을 선택해주세요'); return; }
    if (!form.destination.trim()) { setError('목적지를 입력해주세요'); return; }
    if (!form.start_datetime || !form.end_datetime) { setError('출발/반납 일시를 입력해주세요'); return; }
    if (new Date(form.end_datetime) <= new Date(form.start_datetime)) { setError('반납 일시는 출발 일시보다 이후여야 합니다'); return; }
    if (selectedGroupIds.length === 0) { setError('차량군을 선택해주세요'); return; }

    setLoading(true);
    try {
      // 차량군이 1개일 때: 기존 신청 수정
      // 차량군이 여러 개일 때: 기존 신청 수정 + 추가 신청 생성
      const [firstGroupId, ...extraGroupIds] = selectedGroupIds;

      const isBus = vehicleGroups.find(g => g.id === firstGroupId)?.name.includes('버스') ?? false;
      const body: Record<string, unknown> = {
        vehicle_group_id: firstGroupId,
        destination: form.destination,
        passengers: form.passengers,
        start_datetime: new Date(form.start_datetime).toISOString(),
        end_datetime: new Date(form.end_datetime).toISOString(),
        reason: form.reason,
        driver_name: isBus ? null : (form.driver_name.trim() || null),
        driver_phone: isBus ? null : (form.driver_phone.trim() || null),
      };
      if (purposeMode === 'select') { body.purpose_id = purposeId; body.custom_purpose = null; }
      else { body.custom_purpose = form.custom_purpose.trim(); body.purpose_id = null; }

      const res = await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '수정에 실패했습니다'); return; }

      // 추가 차량군 있으면 새 신청 생성
      if (extraGroupIds.length > 0) {
        await Promise.all(
          extraGroupIds.map(gid =>
            fetch('/api/requests', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...body, vehicle_group_id: gid, department_id: departmentId }),
            })
          )
        );
      }

      router.push(`/m/requests/${id}`);
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  const datesValid = form.start_datetime && form.end_datetime &&
    new Date(form.end_datetime) > new Date(form.start_datetime);

  if (initialLoading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">불러오는 중...</div>;
  }

  if (error && !form.destination) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-gray-500 text-sm">{error}</p>
        <button onClick={() => router.back()} className="text-blue-600 text-sm font-medium">돌아가기</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-1">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">신청 수정</h1>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
        )}

        {/* 소속 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">소속 *</label>
          {departments.length === 1 ? (
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium text-gray-700">{departments[0].name}</div>
          ) : (
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">소속 선택</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
        </div>

        {/* 사용목적 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">사용목적 *</label>
          <select
            value={purposeMode === 'direct' ? DIRECT_INPUT_VALUE : purposeId}
            onChange={e => {
              if (e.target.value === DIRECT_INPUT_VALUE) { setPurposeMode('direct'); setPurposeId(''); }
              else { setPurposeMode('select'); setPurposeId(e.target.value); }
            }}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">선택하세요</option>
            {purposes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={DIRECT_INPUT_VALUE}>✏️ 직접 입력</option>
          </select>
          {purposeMode === 'direct' && (
            <input name="custom_purpose" value={form.custom_purpose} onChange={handleChange}
              placeholder="사용목적 직접 입력 (최대 20자)" maxLength={20}
              className="mt-2 w-full px-4 py-3 border border-blue-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
        </div>

        {/* 목적지 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">목적지 *</label>
          <input name="destination" value={form.destination} onChange={handleChange}
            placeholder="목적지를 입력하세요"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* 탑승 인원 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">탑승 인원 *</label>
          <input name="passengers" type="number" value={form.passengers} onChange={handleChange} min={1} max={50}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* 출발 일시 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">출발 일시 *</label>
          <div className="relative h-12 cursor-pointer">
            <input name="start_datetime" type="datetime-local" value={form.start_datetime} onChange={handleChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="absolute inset-0 flex items-center justify-between px-4 border border-gray-200 rounded-xl bg-white pointer-events-none">
              {form.start_datetime ? (
                <span className="text-sm text-gray-900">
                  {format(new Date(form.start_datetime), 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko })}
                </span>
              ) : (
                <span className="text-sm text-gray-400">날짜 및 시간을 선택하세요</span>
              )}
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* 반납 일시 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">반납 일시 *</label>
          <div className="relative h-12 cursor-pointer">
            <input name="end_datetime" type="datetime-local" value={form.end_datetime} onChange={handleChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="absolute inset-0 flex items-center justify-between px-4 border border-gray-200 rounded-xl bg-white pointer-events-none">
              {form.end_datetime ? (
                <span className="text-sm text-gray-900">
                  {format(new Date(form.end_datetime), 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko })}
                </span>
              ) : (
                <span className="text-sm text-gray-400">날짜 및 시간을 선택하세요</span>
              )}
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* 차량군 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-700">차량군 * <span className="text-gray-400 font-normal">(복수 선택 가능)</span></label>
            {checkingAvailability && <span className="text-xs text-blue-500 animate-pulse">가용 확인 중...</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {vehicleGroups.map(g => {
              const isSelected = selectedGroupIds.includes(g.id);
              const avail = datesValid ? groupAvailability[g.id] : null;
              const isDisabled = avail === false;
              return (
                <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} disabled={isDisabled}
                  className={`relative px-4 py-3 rounded-xl text-sm font-medium border transition-colors ${
                    isDisabled ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' :
                    isSelected  ? 'bg-blue-600 text-white border-blue-600' :
                    'bg-white text-gray-700 border-gray-200'
                  }`}>
                  <span>{g.name}</span>
                  {isDisabled && <span className="block text-xs mt-0.5 text-gray-300">배차 불가</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 운전기사 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            운전기사
            {selectedGroupIds.length > 0 && !selectedGroupIds.every(id => vehicleGroups.find(g => g.id === id)?.name.includes('버스')) && (
              <span className="text-red-500"> *</span>
            )}
          </label>
          {selectedGroupIds.length > 0 && selectedGroupIds.every(id => vehicleGroups.find(g => g.id === id)?.name.includes('버스')) ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-600 font-medium">
              버스 차량군 — 배차 시 차량위원회에서 기사를 지정합니다
            </div>
          ) : (
            <>
              <input
                name="driver_name"
                value={form.driver_name}
                onChange={handleChange}
                placeholder="운전기사 이름"
                maxLength={30}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                name="driver_phone"
                type="tel"
                value={form.driver_phone}
                onChange={handleChange}
                placeholder="운전기사 연락처 (예: 010-1234-5678)"
                maxLength={20}
                className="mt-2 w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
        </div>

        {/* 사용 사유 */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">사용 사유</label>
          <textarea name="reason" value={form.reason} onChange={handleChange} rows={3}
            placeholder="사용 사유를 입력하세요 (선택)"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        <button onClick={handleSubmit} disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-base font-semibold transition-colors disabled:opacity-60">
          {loading ? '저장 중...' : '수정 완료'}
        </button>
      </div>
    </div>
  );
}
