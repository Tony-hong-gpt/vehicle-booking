'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  generateRecurringDates,
  describePattern,
  WEEKDAY_OPTIONS,
  WEEK_OF_MONTH_OPTIONS,
  PATTERN_TYPE_OPTIONS,
} from '@/lib/recurring-utils';

interface SelectOption { id: string; name: string; }

export default function NewRecurringRequestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [departments, setDepartments] = useState<SelectOption[]>([]);
  const [purposes, setPurposes] = useState<SelectOption[]>([]);
  const [vehicleGroups, setVehicleGroups] = useState<SelectOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [form, setForm] = useState({
    title: '',
    department_id: '',
    purpose_id: '',
    custom_purpose: '',
    vehicle_group_id: '',
    destination: '',
    passengers: 1,
    driver_name: '',
    driver_phone: '',
    pattern_type: 'weekly' as 'weekly' | 'biweekly' | 'monthly_date' | 'monthly_weekday',
    weekdays: [] as number[],
    monthly_dates: [] as number[],
    week_of_month: 1,
    weekday: 1,
    start_time: '09:00',
    end_time: '18:00',
    period_start: '',
    period_end: '',
    reason: '',
  });

  const [purposeMode, setPurposeMode] = useState<'select' | 'direct'>('select');
  const [previewDates, setPreviewDates] = useState<{ date: Date; startISO: string; endISO: string }[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/departments?page_size=200').then(r => r.json()),
      fetch('/api/purposes').then(r => r.json()),
      fetch('/api/vehicle-groups').then(r => r.json()),
    ]).then(([d, p, g]) => {
      setDepartments(d.data || []);
      setPurposes(p.data || []);
      setVehicleGroups(g.data || []);
    }).finally(() => setDataLoading(false));
  }, []);

  // 날짜 미리보기 계산
  useEffect(() => {
    if (!form.period_start || !form.period_end || !form.start_time || !form.end_time) {
      setPreviewDates([]);
      return;
    }
    if (form.pattern_type === 'weekly' || form.pattern_type === 'biweekly') {
      if (form.weekdays.length === 0) { setPreviewDates([]); return; }
    }
    if (form.pattern_type === 'monthly_date' && form.monthly_dates.length === 0) {
      setPreviewDates([]); return;
    }
    try {
      const dates = generateRecurringDates({
        pattern_type: form.pattern_type,
        weekdays: form.weekdays.length > 0 ? form.weekdays : undefined,
        monthly_dates: form.monthly_dates.length > 0 ? form.monthly_dates : undefined,
        week_of_month: form.pattern_type === 'monthly_weekday' ? form.week_of_month : undefined,
        weekday: form.pattern_type === 'monthly_weekday' ? form.weekday : undefined,
        start_time: form.start_time,
        end_time: form.end_time,
        period_start: form.period_start,
        period_end: form.period_end,
      });
      setPreviewDates(dates);
    } catch { setPreviewDates([]); }
  }, [form.pattern_type, form.weekdays, form.monthly_dates, form.week_of_month, form.weekday,
      form.start_time, form.end_time, form.period_start, form.period_end]);

  function toggleWeekday(dow: number) {
    setForm(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(dow)
        ? prev.weekdays.filter(d => d !== dow)
        : [...prev.weekdays, dow].sort(),
    }));
  }

  function toggleMonthlyDate(date: number) {
    setForm(prev => ({
      ...prev,
      monthly_dates: prev.monthly_dates.includes(date)
        ? prev.monthly_dates.filter(d => d !== date)
        : [...prev.monthly_dates, date].sort((a, b) => a - b),
    }));
  }

  async function handleSubmit() {
    setError('');
    if (!form.title.trim()) { setError('제목을 입력해주세요'); return; }
    if (!form.department_id) { setError('소속을 선택해주세요'); return; }
    if (purposeMode === 'select' && !form.purpose_id) { setError('사용목적을 선택해주세요'); return; }
    if (purposeMode === 'direct' && !form.custom_purpose.trim()) { setError('사용목적을 입력해주세요'); return; }
    if (!form.vehicle_group_id) { setError('차량군을 선택해주세요'); return; }
    if (!form.destination.trim()) { setError('목적지를 입력해주세요'); return; }
    if (!form.period_start || !form.period_end) { setError('적용 기간을 입력해주세요'); return; }
    if (form.period_end < form.period_start) { setError('종료일은 시작일 이후여야 합니다'); return; }
    if ((form.pattern_type === 'weekly' || form.pattern_type === 'biweekly') && form.weekdays.length === 0) {
      setError('요일을 하나 이상 선택해주세요'); return;
    }
    if (form.pattern_type === 'monthly_date' && form.monthly_dates.length === 0) {
      setError('날짜를 하나 이상 선택해주세요'); return;
    }
    if (previewDates.length === 0) { setError('선택된 패턴으로 생성되는 신청 건이 없습니다. 기간과 패턴을 확인해주세요'); return; }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        department_id: form.department_id,
        purpose_id: purposeMode === 'select' ? form.purpose_id : null,
        custom_purpose: purposeMode === 'direct' ? form.custom_purpose.trim() : null,
        vehicle_group_id: form.vehicle_group_id,
        destination: form.destination.trim(),
        passengers: form.passengers,
        driver_name: form.driver_name.trim() || null,
        driver_phone: form.driver_phone.trim() || null,
        pattern_type: form.pattern_type,
        weekdays: (form.pattern_type === 'weekly' || form.pattern_type === 'biweekly') ? form.weekdays : null,
        monthly_dates: form.pattern_type === 'monthly_date' ? form.monthly_dates : null,
        week_of_month: form.pattern_type === 'monthly_weekday' ? form.week_of_month : null,
        weekday: form.pattern_type === 'monthly_weekday' ? form.weekday : null,
        start_time: form.start_time,
        end_time: form.end_time,
        period_start: form.period_start,
        period_end: form.period_end,
        reason: form.reason.trim() || null,
      };

      const res = await fetch('/api/recurring-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || '등록에 실패했습니다'); return; }
      router.push('/recurring-requests');
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const patternSummary = form.period_start ? describePattern({
    pattern_type: form.pattern_type,
    weekdays: form.weekdays,
    monthly_dates: form.monthly_dates,
    week_of_month: form.week_of_month,
    weekday: form.weekday,
    start_time: form.start_time,
    end_time: form.end_time,
    period_start: form.period_start || '2025-01-01',
    period_end: form.period_end || '2025-12-31',
  }) : '';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">장기 차량 신청 등록</h1>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 입력 폼 */}
        <div className="lg:col-span-2 space-y-5">
          {/* 기본 정보 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">기본 정보</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">제목 *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="예: 임원 정기 운행"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">소속 *</label>
                <select value={form.department_id} onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">선택</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">차량군 *</label>
                <select value={form.vehicle_group_id} onChange={e => setForm(p => ({ ...p, vehicle_group_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">선택</option>
                  {vehicleGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">사용목적 *</label>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => setPurposeMode('select')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${purposeMode === 'select' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  목록 선택
                </button>
                <button type="button" onClick={() => setPurposeMode('direct')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${purposeMode === 'direct' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  직접 입력
                </button>
              </div>
              {purposeMode === 'select' ? (
                <select value={form.purpose_id} onChange={e => setForm(p => ({ ...p, purpose_id: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">선택</option>
                  {purposes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <input value={form.custom_purpose} onChange={e => setForm(p => ({ ...p, custom_purpose: e.target.value }))}
                  placeholder="사용목적 직접 입력 (최대 20자)" maxLength={20}
                  className="w-full px-3 py-2.5 border border-blue-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">목적지 *</label>
                <input value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                  placeholder="목적지 입력"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">탑승 인원 *</label>
                <input type="number" min={1} max={50} value={form.passengers}
                  onChange={e => setForm(p => ({ ...p, passengers: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">운전기사</label>
                <input value={form.driver_name} onChange={e => setForm(p => ({ ...p, driver_name: e.target.value }))}
                  placeholder="기사 이름"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">기사 연락처</label>
                <input value={form.driver_phone} onChange={e => setForm(p => ({ ...p, driver_phone: e.target.value }))}
                  placeholder="010-0000-0000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">사용 사유</label>
              <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                rows={2} placeholder="사용 사유 (선택)"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
          </div>

          {/* 반복 패턴 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">반복 패턴</h2>

            {/* 패턴 유형 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">반복 유형 *</label>
              <div className="grid grid-cols-2 gap-2">
                {PATTERN_TYPE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setForm(p => ({ ...p, pattern_type: opt.value as any }))}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      form.pattern_type === opt.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 요일 선택 (매주 / 격주) */}
            {(form.pattern_type === 'weekly' || form.pattern_type === 'biweekly') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">요일 선택 *</label>
                <div className="flex gap-2 flex-wrap">
                  {WEEKDAY_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => toggleWeekday(opt.value)}
                      className={`w-10 h-10 rounded-full text-sm font-semibold border transition-colors ${
                        form.weekdays.includes(opt.value)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 날짜 선택 (매월 특정일) */}
            {form.pattern_type === 'monthly_date' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">날짜 선택 * (1~31)</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <button key={d} type="button"
                      onClick={() => toggleMonthlyDate(d)}
                      className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${
                        form.monthly_dates.includes(d)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 매월 N번째 요일 */}
            {form.pattern_type === 'monthly_weekday' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">N번째 주 *</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEK_OF_MONTH_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setForm(p => ({ ...p, week_of_month: opt.value }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          form.week_of_month === opt.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">요일 *</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WEEKDAY_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setForm(p => ({ ...p, weekday: opt.value }))}
                        className={`w-9 h-9 rounded-full text-sm font-semibold border transition-colors ${
                          form.weekday === opt.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 시간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">출발 시간 *</label>
                <input type="time" value={form.start_time}
                  onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">반납 시간 *</label>
                <input type="time" value={form.end_time}
                  onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* 적용 기간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">기간 시작 *</label>
                <input type="date" value={form.period_start}
                  onChange={e => setForm(p => ({ ...p, period_start: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">기간 종료 *</label>
                <input type="date" value={form.period_end}
                  onChange={e => setForm(p => ({ ...p, period_end: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <button onClick={handleSubmit} disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl text-base font-semibold transition-colors disabled:opacity-60">
            {loading ? '등록 중...' : '장기 신청 등록'}
          </button>
        </div>

        {/* 우측: 날짜 미리보기 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sticky top-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">날짜 미리보기</h2>
              {previewDates.length > 0 && (
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                  {previewDates.length}건
                </span>
              )}
            </div>
            {patternSummary && (
              <p className="text-xs text-gray-500 mb-3 bg-gray-50 rounded-lg px-3 py-2">
                {patternSummary} · {form.start_time}~{form.end_time}
              </p>
            )}
            {previewDates.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                패턴과 기간을 설정하면<br />생성될 날짜가 표시됩니다
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-1">
                {previewDates.map((d, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-gray-50 text-xs">
                    <span className="text-gray-800 font-medium">
                      {format(d.date, 'M월 d일 (EEE)', { locale: ko })}
                    </span>
                    <span className="text-gray-400">{form.start_time}~{form.end_time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
