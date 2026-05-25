'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface SelectOption { id: string; name: string; }

const DIRECT_INPUT_VALUE = '__direct__';

export default function MobileRequestPage() {
  const router = useRouter();
  const [purposes, setPurposes] = useState<SelectOption[]>([]);
  const [vehicleGroups, setVehicleGroups] = useState<SelectOption[]>([]);
  const [departments, setDepartments] = useState<SelectOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true); // 초기 데이터 로딩

  // 차량군별 가용 여부 { groupId: boolean }
  const [groupAvailability, setGroupAvailability] = useState<Record<string, boolean | null>>({});
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: 기본정보, 2: 최종 확인

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

  // 날짜/시간 분리 입력 상태 (모바일 호환성)
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  function handleStartDate(date: string) {
    setStartDate(date);
    const combined = date && startTime ? `${date}T${startTime}` : '';
    setForm(prev => ({ ...prev, start_datetime: combined }));
  }
  function handleStartTime(time: string) {
    setStartTime(time);
    const combined = startDate && time ? `${startDate}T${time}` : '';
    setForm(prev => ({ ...prev, start_datetime: combined }));
  }
  function handleEndDate(date: string) {
    setEndDate(date);
    const combined = date && endTime ? `${date}T${endTime}` : '';
    setForm(prev => ({ ...prev, end_datetime: combined }));
  }
  function handleEndTime(time: string) {
    setEndTime(time);
    const combined = endDate && time ? `${endDate}T${time}` : '';
    setForm(prev => ({ ...prev, end_datetime: combined }));
  }

  // 초기 데이터 한 번에 로드 → 완료 후 렌더링
  useEffect(() => {
    Promise.all([
      fetch('/api/purposes').then(r => r.json()),
      fetch('/api/vehicle-groups').then(r => r.json()),
      fetch('/api/user-departments').then(r => r.json()),
    ]).then(([p, g, d]) => {
      setPurposes(p.data || []);
      setVehicleGroups(g.data || []);
      setDepartments(d.data || []);
      if (d.data?.length === 1) setDepartmentId(d.data[0].id);
    }).finally(() => setDataLoading(false));
  }, []);

  // 날짜가 바뀌면 각 차량군별 가용 차량 여부 확인
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
    const endISO = new Date(form.end_datetime).toISOString();

    const results = await Promise.all(
      vehicleGroups.map(async g => {
        const params = new URLSearchParams({
          start_datetime: startISO,
          end_datetime: endISO,
          vehicle_group_id: g.id,
        });
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
    setSelectedGroupIds(prev => prev.filter(id => map[id] !== false));
    setCheckingAvailability(false);
  }, [form.start_datetime, form.end_datetime, vehicleGroups]);

  useEffect(() => {
    checkGroupAvailability();
  }, [checkGroupAvailability]);

  function toggleGroup(id: string) {
    if (groupAvailability[id] === false) return;
    setSelectedGroupIds(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'passengers' ? Number(value) : value }));
  }

  // 탑승 인원 증감
  function changePassengers(delta: number) {
    setForm(prev => ({
      ...prev,
      passengers: Math.min(50, Math.max(1, prev.passengers + delta)),
    }));
  }

  const hasNonBusGroup = selectedGroupIds.some(id => {
    const g = vehicleGroups.find((x: SelectOption) => x.id === id);
    return g && !g.name.includes('버스');
  });
  const hasOnlyBusGroups = selectedGroupIds.length > 0 && !hasNonBusGroup;

  function validateStep1() {
    if (purposeMode === 'select' && !purposeId) { setError('사용목적을 선택해주세요'); return false; }
    if (purposeMode === 'direct' && !form.custom_purpose.trim()) { setError('사용목적을 입력해주세요'); return false; }
    if (!departmentId) { setError('소속을 선택해주세요'); return false; }
    if (!form.destination.trim()) { setError('목적지를 입력해주세요'); return false; }
    if (!form.start_datetime || !form.end_datetime) { setError('출발/반납 일시를 입력해주세요'); return false; }
    if (new Date(form.end_datetime) <= new Date(form.start_datetime)) { setError('반납 일시는 출발 일시보다 이후여야 합니다'); return false; }
    if (selectedGroupIds.length === 0) { setError('차량군을 하나 이상 선택해주세요'); return false; }
    if (hasNonBusGroup && !form.driver_name.trim()) { setError('운전기사 이름을 입력해주세요'); return false; }
    return true;
  }

  function goStep2() {
    setError('');
    if (!validateStep1()) return;
    setStep(2);
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);
    try {
      const results = await Promise.all(
        selectedGroupIds.map(async groupId => {
          const g = vehicleGroups.find((x: SelectOption) => x.id === groupId);
          const isBus = g?.name.includes('버스') ?? false;
          const body: Record<string, unknown> = {
            vehicle_group_id: groupId,
            department_id: departmentId,
            destination: form.destination,
            passengers: form.passengers,
            start_datetime: new Date(form.start_datetime).toISOString(),
            end_datetime: new Date(form.end_datetime).toISOString(),
            reason: form.reason,
            driver_name: isBus ? null : (form.driver_name.trim() || null),
            driver_phone: isBus ? null : (form.driver_phone.trim() || null),
          };
          if (purposeMode === 'select') {
            body.purpose_id = purposeId;
            body.custom_purpose = null;
          } else {
            body.custom_purpose = form.custom_purpose.trim();
            body.purpose_id = null;
          }

          const res = await fetch('/api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          return { res, data: await res.json() };
        })
      );

      const failed = results.find(r => !r.res.ok);
      if (failed) {
        setError(failed.data.error || '신청에 실패했습니다');
        return;
      }

      router.push('/m/requests');
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  const selectedDept = departments.find(d => d.id === departmentId);
  const selectedPurpose = purposes.find(p => p.id === purposeId);
  const selectedGroups = vehicleGroups.filter(g => selectedGroupIds.includes(g.id));

  const datesValid = form.start_datetime && form.end_datetime &&
    new Date(form.end_datetime) > new Date(form.start_datetime);

  // 초기 데이터 로딩 중 — 레이아웃 고정 스켈레톤
  if (dataLoading) {
    return (
      <div className="flex flex-col min-h-full">
        <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => router.back()} className="p-1">
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900">차량 신청</h1>
          <div className="ml-auto flex gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-600" />
            <div className="w-2 h-2 rounded-full bg-gray-200" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">불러오는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full w-full overflow-x-hidden">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => step > 1 ? setStep(step - 1) : router.back()} className="p-1">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">차량 신청</h1>
        <div className="ml-auto flex gap-1">
          {[1, 2].map(s => (
            <div key={s} className={`w-2 h-2 rounded-full ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 w-full min-w-0">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
        )}

        {/* Step 1: 기본 정보 */}
        {step === 1 && (
          <>
            {/* 소속 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">소속 *</label>
              {departments.length === 0 ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-700">
                  소속 부서가 없습니다. 내 정보에서 소속을 추가해주세요.
                </div>
              ) : departments.length === 1 ? (
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

            {/* 탑승 인원 — 커스텀 증감 버튼 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">탑승 인원 *</label>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => changePassengers(-1)}
                  disabled={form.passengers <= 1}
                  style={{ touchAction: 'manipulation' }}
                  className="w-14 h-12 flex items-center justify-center text-xl font-bold text-gray-500 active:bg-gray-100 disabled:text-gray-200 transition-colors flex-shrink-0 select-none"
                >
                  −
                </button>
                <div className="flex-1 h-12 flex items-center justify-center border-x border-gray-200">
                  <input
                    name="passengers"
                    type="number"
                    inputMode="numeric"
                    value={form.passengers}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setForm(prev => ({ ...prev, passengers: Math.min(50, Math.max(1, v)) }));
                    }}
                    onFocus={e => e.target.select()}
                    min={1}
                    max={50}
                    className="w-full text-center text-base font-bold text-gray-900 focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => changePassengers(1)}
                  disabled={form.passengers >= 50}
                  style={{ touchAction: 'manipulation' }}
                  className="w-14 h-12 flex items-center justify-center text-xl font-bold text-gray-500 active:bg-gray-100 disabled:text-gray-200 transition-colors flex-shrink-0 select-none"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1 px-1">최대 50명</p>
            </div>

            {/* 출발 일시 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">출발 일시 *</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => handleStartDate(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={e => handleStartTime(e.target.value)}
                  className="w-32 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>

            {/* 반납 일시 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">반납 일시 *</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={endDate}
                  onChange={e => handleEndDate(e.target.value)}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={e => handleEndTime(e.target.value)}
                  className="w-32 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>

            {/* 차량군 (다중 선택) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">차량군 * <span className="text-gray-400 font-normal">(복수 선택 가능)</span></label>
                {checkingAvailability && (
                  <span className="text-xs text-blue-500 animate-pulse">가용 확인 중...</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {vehicleGroups.map(g => {
                  const isSelected = selectedGroupIds.includes(g.id);
                  const avail = datesValid ? groupAvailability[g.id] : null;
                  const isDisabled = avail === false;

                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      disabled={isDisabled}
                      className={`relative px-4 py-3 rounded-xl text-sm font-medium border transition-colors ${
                        isDisabled
                          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 active:bg-gray-50'
                      }`}
                    >
                      <span>{g.name}</span>
                      {isDisabled && (
                        <span className="block text-xs mt-0.5 text-gray-300">배차 불가</span>
                      )}
                      {isSelected && !isDisabled && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-white rounded-full opacity-80" />
                      )}
                    </button>
                  );
                })}
              </div>

              {datesValid && !checkingAvailability && Object.keys(groupAvailability).length > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  * 배차 불가 표시된 차량군은 해당 기간에 사용 가능한 차량이 없습니다
                </p>
              )}
            </div>

            {/* 운전기사 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                운전기사
                {hasNonBusGroup && <span className="text-red-500"> *</span>}
                {selectedGroupIds.length === 0 && <span className="text-gray-400 font-normal text-xs ml-1">(차량군 선택 후 필요 여부 결정)</span>}
              </label>
              {hasOnlyBusGroups ? (
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
                  {selectedGroupIds.some(id => vehicleGroups.find((x: SelectOption) => x.id === id)?.name.includes('버스')) && (
                    <p className="text-xs text-gray-400 mt-1">버스 차량군의 경우 기사는 차량위원회에서 별도 지정됩니다</p>
                  )}
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

            <button onClick={goStep2}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-base font-semibold transition-colors">
              다음 — 내용 확인
            </button>
          </>
        )}

        {/* Step 2: 최종 확인 */}
        {step === 2 && (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">신청 내용 확인</p>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { label: '소속', value: selectedDept?.name || '-' },
                  { label: '사용목적', value: purposeMode === 'select' ? (selectedPurpose?.name || '-') : form.custom_purpose },
                  { label: '목적지', value: form.destination },
                  { label: '탑승 인원', value: `${form.passengers}명` },
                  {
                    label: '차량군',
                    value: selectedGroups.length > 0
                      ? selectedGroups.map(g => g.name).join(', ')
                      : '-',
                  },
                  { label: '출발', value: form.start_datetime.replace('T', ' ') },
                  { label: '반납', value: form.end_datetime.replace('T', ' ') },
                  { label: '운전기사', value: hasOnlyBusGroups ? '차량위 지정' : (form.driver_name || '-') },
                  ...(!hasOnlyBusGroups && form.driver_phone ? [{ label: '기사 연락처', value: form.driver_phone }] : []),
                  ...(form.reason ? [{ label: '사용 사유', value: form.reason }] : []),
                ].map(item => (
                  <div key={item.label} className="px-4 py-3 flex justify-between items-start gap-3">
                    <span className="text-xs text-gray-500 flex-shrink-0">{item.label}</span>
                    <span className="text-sm font-medium text-gray-900 text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedGroupIds.length > 1 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                차량군 {selectedGroupIds.length}개가 선택되어 신청 {selectedGroupIds.length}건이 동시에 접수됩니다.
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
            )}

            <button onClick={handleSubmit} disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-base font-semibold transition-colors disabled:opacity-60">
              {loading ? '신청 중...' : `신청 완료${selectedGroupIds.length > 1 ? ` (${selectedGroupIds.length}건)` : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
