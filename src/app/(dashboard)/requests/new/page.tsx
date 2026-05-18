'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SelectOption { id: string; name: string; }

const DIRECT_INPUT_VALUE = '__direct__';

export default function NewRequestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [purposes, setPurposes] = useState<SelectOption[]>([]);
  const [vehicleGroups, setVehicleGroups] = useState<SelectOption[]>([]);
  const [purposeMode, setPurposeMode] = useState<'select' | 'direct'>('select');

  // 선택형 ID들을 form 객체와 별도로 관리 (Zod UUID 검증 우회 방지)
  const [vehicleGroupId, setVehicleGroupId] = useState('');
  const [purposeId, setPurposeId] = useState('');

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

  useEffect(() => {
    fetch('/api/purposes').then(r => r.json()).then(d => setPurposes(d.data || []));
    fetch('/api/vehicle-groups').then(r => r.json()).then(d => setVehicleGroups(d.data || []));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'passengers' ? Number(value) : value }));
  }

  function handlePurposeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === DIRECT_INPUT_VALUE) {
      setPurposeMode('direct');
      setPurposeId('');
      setForm(prev => ({ ...prev, custom_purpose: '' }));
    } else {
      setPurposeMode('select');
      setPurposeId(value);
      setForm(prev => ({ ...prev, custom_purpose: '' }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (purposeMode === 'select' && !purposeId) {
      setError('사용목적을 선택해주세요');
      return;
    }
    if (purposeMode === 'direct' && !form.custom_purpose.trim()) {
      setError('사용목적을 입력해주세요');
      return;
    }
    if (!vehicleGroupId) {
      setError('차량군을 선택해주세요');
      return;
    }
    const selectedGroup = vehicleGroups.find(g => g.id === vehicleGroupId);
    const isBus = selectedGroup?.name.includes('버스') ?? false;
    if (!isBus && !form.driver_name.trim()) {
      setError('운전기사 이름을 입력해주세요');
      return;
    }
    if (!form.destination.trim()) {
      setError('목적지를 입력해주세요');
      return;
    }
    if (!form.start_datetime || !form.end_datetime) {
      setError('출발 일시와 반납 일시를 입력해주세요');
      return;
    }
    if (new Date(form.end_datetime) <= new Date(form.start_datetime)) {
      setError('반납 일시는 출발 일시보다 이후여야 합니다');
      return;
    }

    setLoading(true);
    try {
      const selectedGroup = vehicleGroups.find(g => g.id === vehicleGroupId);
      const isBus = selectedGroup?.name.includes('버스') ?? false;
      const body: Record<string, unknown> = {
        vehicle_group_id: vehicleGroupId,
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
      } else {
        body.custom_purpose = form.custom_purpose.trim();
      }

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '신청에 실패했습니다'); return; }
      router.push('/requests');
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
          ← 돌아가기
        </button>
        <h1 className="text-2xl font-bold text-gray-900">차량 사용 신청</h1>
        <p className="text-gray-500 mt-1 text-sm">차량 사용을 신청합니다</p>
      </div>

      <form onSubmit={handleSubmit} autoComplete="off" className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* 사용목적 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              사용목적 <span className="text-red-500">*</span>
            </label>
            <select
              value={purposeMode === 'direct' ? DIRECT_INPUT_VALUE : purposeId}
              onChange={handlePurposeChange}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              {purposes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={DIRECT_INPUT_VALUE}>✏️ 직접 입력</option>
            </select>

            {purposeMode === 'direct' && (
              <div className="mt-2">
                <input
                  name="custom_purpose"
                  value={form.custom_purpose}
                  onChange={handleChange}
                  placeholder="사용목적 직접 입력 (최대 20자)"
                  maxLength={20}
                  className="w-full px-3 py-2.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{form.custom_purpose.length}/20자</p>
              </div>
            )}
          </div>

          {/* 차량군 — 별도 state로 완전히 독립 관리 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              차량군 <span className="text-red-500">*</span>
            </label>
            <select
              value={vehicleGroupId}
              onChange={e => setVehicleGroupId(e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                vehicleGroupId ? 'border-blue-400' : 'border-gray-300'
              }`}
            >
              <option value="">선택하세요</option>
              {vehicleGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            목적지 <span className="text-red-500">*</span>
          </label>
          <input name="destination" value={form.destination} onChange={handleChange} required
            placeholder="목적지를 입력하세요"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            탑승 인원 <span className="text-red-500">*</span>
          </label>
          <input name="passengers" type="number" value={form.passengers} onChange={handleChange} min={1} max={50} required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* 운전기사 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            운전기사
            {vehicleGroupId && !vehicleGroups.find(g => g.id === vehicleGroupId)?.name.includes('버스') && (
              <span className="text-red-500"> *</span>
            )}
          </label>
          {vehicleGroupId && vehicleGroups.find(g => g.id === vehicleGroupId)?.name.includes('버스') ? (
            <div className="px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-600 font-medium">
              차량위 — 배차 시 차량위원회에서 기사를 지정합니다
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <input
                name="driver_name"
                value={form.driver_name}
                onChange={handleChange}
                placeholder={vehicleGroupId ? '운전기사 이름' : '차량군을 먼저 선택하세요'}
                disabled={!vehicleGroupId}
                maxLength={30}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <input
                name="driver_phone"
                type="tel"
                value={form.driver_phone}
                onChange={handleChange}
                placeholder="연락처 (예: 010-1234-5678)"
                disabled={!vehicleGroupId}
                maxLength={20}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              출발 일시 <span className="text-red-500">*</span>
            </label>
            <input name="start_datetime" type="datetime-local" value={form.start_datetime} onChange={handleChange} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              반납 일시 <span className="text-red-500">*</span>
            </label>
            <input name="end_datetime" type="datetime-local" value={form.end_datetime} onChange={handleChange} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">사용 사유</label>
          <textarea name="reason" value={form.reason} onChange={handleChange} rows={3}
            placeholder="사용 사유를 입력하세요 (선택)"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            취소
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {loading ? '신청 중...' : '신청하기'}
          </button>
        </div>
      </form>
    </div>
  );
}
