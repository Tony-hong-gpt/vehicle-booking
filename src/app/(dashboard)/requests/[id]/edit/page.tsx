'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { REQUEST_STATUS_LABELS } from '@/lib/constants';

interface SelectOption { id: string; name: string; }

const DIRECT_INPUT_VALUE = '__direct__';

// admin이 직접 상태를 변경할 수 있는 전체 목록
const ADMIN_STATUS_OPTIONS = [
  { value: 'pending',        label: '상위승인대기' },
  { value: 'upper_approved', label: '위원회승인대기' },
  { value: 'on_hold',        label: '대기' },
  { value: 'approved',       label: '승인' },
  { value: 'rejected',       label: '반려' },
  { value: 'dispatched',     label: '배차완료' },
  { value: 'in_use',         label: '운행중' },
  { value: 'returned',       label: '반납완료' },
  { value: 'cancelled',      label: '취소' },
];

export default function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError]       = useState('');
  const [userRole, setUserRole] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');

  const [purposes, setPurposes]           = useState<SelectOption[]>([]);
  const [vehicleGroups, setVehicleGroups] = useState<SelectOption[]>([]);
  const [departments, setDepartments]     = useState<SelectOption[]>([]);
  const [purposeMode, setPurposeMode]     = useState<'select' | 'direct'>('select');

  const [vehicleGroupId, setVehicleGroupId] = useState('');
  const [purposeId, setPurposeId]           = useState('');
  const [departmentId, setDepartmentId]     = useState('');
  const [adminStatus, setAdminStatus]       = useState(''); // admin 상태 변경용
  const [adminNote, setAdminNote]           = useState(''); // 상태 변경 사유

  const [rejectionComment, setRejectionComment] = useState('');
  const [rejectionApprover, setRejectionApprover] = useState('');
  const [holdComment, setHoldComment]   = useState('');
  const [holdApprover, setHoldApprover] = useState('');

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
    async function fetchAll() {
      try {
        const [reqRes, purposesRes, groupsRes, deptsRes, meRes] = await Promise.all([
          fetch(`/api/requests/${id}`).then(r => r.json()),
          fetch('/api/purposes').then(r => r.json()),
          fetch('/api/vehicle-groups').then(r => r.json()),
          fetch('/api/departments').then(r => r.json()),
          fetch('/api/auth/me').then(r => r.json()),
        ]);

        setPurposes(purposesRes.data || []);
        setVehicleGroups(groupsRes.data || []);
        setDepartments(deptsRes.data || []);
        setUserRole(meRes.data?.role || '');

        const req = reqRes.data;
        if (!req) { setError('신청을 찾을 수 없습니다'); return; }

        setCurrentStatus(req.status);
        setAdminStatus(req.status);
        setDepartmentId(req.department_id || req.department?.id || '');

        const rejApproval  = (req.approvals || []).find((a: any) => a.status === 'rejected');
        const holdApproval = (req.approvals || []).find((a: any) => a.status === 'on_hold');
        if (rejApproval?.comment)     { setRejectionComment(rejApproval.comment); setRejectionApprover(rejApproval.approver?.name || ''); }
        if (holdApproval?.comment)    { setHoldComment(holdApproval.comment);     setHoldApprover(holdApproval.approver?.name || ''); }

        setVehicleGroupId(req.vehicle_group_id || req.vehicle_group?.id || '');

        if (req.custom_purpose) {
          setPurposeMode('direct');
          setForm(prev => ({ ...prev, custom_purpose: req.custom_purpose || '' }));
        } else {
          setPurposeMode('select');
          setPurposeId(req.purpose_id || req.purpose?.id || '');
        }

        const toLocal = (iso: string) => {
          if (!iso) return '';
          const d = new Date(iso);
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        setForm(prev => ({
          ...prev,
          destination:     req.destination    || '',
          passengers:      req.passengers     || 1,
          start_datetime:  toLocal(req.start_datetime),
          end_datetime:    toLocal(req.end_datetime),
          reason:          req.reason         || '',
          driver_name:     req.driver_name    || '',
          driver_phone:    req.driver_phone   || '',
        }));
      } finally {
        setFetching(false);
      }
    }
    fetchAll();
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'passengers' ? Number(value) : value }));
  }

  function handlePurposeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value === DIRECT_INPUT_VALUE) {
      setPurposeMode('direct'); setPurposeId('');
      setForm(prev => ({ ...prev, custom_purpose: '' }));
    } else {
      setPurposeMode('select'); setPurposeId(value);
      setForm(prev => ({ ...prev, custom_purpose: '' }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (purposeMode === 'select' && !purposeId)              { setError('사용목적을 선택해주세요'); return; }
    if (purposeMode === 'direct' && !form.custom_purpose.trim()) { setError('사용목적을 입력해주세요'); return; }
    if (!vehicleGroupId)                                     { setError('차량군을 선택해주세요'); return; }
    if (!form.destination.trim())                            { setError('목적지를 입력해주세요'); return; }
    if (!form.start_datetime || !form.end_datetime)          { setError('출발/반납 일시를 입력해주세요'); return; }
    if (new Date(form.end_datetime) <= new Date(form.start_datetime)) { setError('반납 일시는 출발 일시보다 이후여야 합니다'); return; }

    setLoading(true);
    try {
      const isBusGroup = vehicleGroups.find(g => g.id === vehicleGroupId)?.name.includes('버스') ?? false;
      const body: Record<string, unknown> = {
        vehicle_group_id: vehicleGroupId,
        destination:      form.destination,
        passengers:       form.passengers,
        start_datetime:   new Date(form.start_datetime).toISOString(),
        end_datetime:     new Date(form.end_datetime).toISOString(),
        reason:           form.reason,
        driver_name:      isBusGroup ? null : (form.driver_name.trim() || null),
        driver_phone:     isBusGroup ? null : (form.driver_phone.trim() || null),
      };
      if (purposeMode === 'select') { body.purpose_id = purposeId; body.custom_purpose = null; }
      else                          { body.custom_purpose = form.custom_purpose.trim(); body.purpose_id = null; }

      // admin이 상태를 변경한 경우에만 status 포함
      if (userRole === 'admin' && adminStatus !== currentStatus) {
        body.status = adminStatus;
        if (adminNote.trim()) body.admin_note = adminNote.trim();
      }
      // admin이 부서를 변경한 경우
      if (userRole === 'admin' && departmentId) {
        body.department_id = departmentId;
      }

      const res = await fetch(`/api/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '수정에 실패했습니다'); return; }
      router.push(`/requests/${id}`);
      router.refresh();
    } catch {
      setError('서버 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) return <div className="p-8 max-w-2xl text-gray-400 text-sm">불러오는 중...</div>;

  const isAdmin = userRole === 'admin';
  const statusWillReset = !isAdmin && ['rejected', 'on_hold'].includes(currentStatus);

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
          ← 돌아가기
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">차량 신청 수정</h1>
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
            현재: {REQUEST_STATUS_LABELS[currentStatus] || currentStatus}
          </span>
        </div>
        {isAdmin ? (
          <p className="text-gray-400 mt-1 text-sm">관리자 권한으로 모든 항목을 수정할 수 있습니다</p>
        ) : statusWillReset ? (
          <p className="text-orange-600 mt-1 text-sm">저장하면 상위승인대기 상태로 변경됩니다</p>
        ) : (
          <p className="text-gray-400 mt-1 text-sm">신청 정보를 수정합니다</p>
        )}
      </div>

      {/* 반려 사유 */}
      {rejectionComment && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-red-500 font-bold text-sm mt-0.5">✗</span>
            <div>
              <p className="text-sm font-semibold text-red-700 mb-1">
                반려 사유 {rejectionApprover && <span className="font-normal text-red-500">— {rejectionApprover}</span>}
              </p>
              <p className="text-sm text-red-700">{rejectionComment}</p>
            </div>
          </div>
        </div>
      )}
      {/* 대기 사유 */}
      {holdComment && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-orange-500 font-bold text-sm mt-0.5">⏸</span>
            <div>
              <p className="text-sm font-semibold text-orange-700 mb-1">
                대기 사유 {holdApprover && <span className="font-normal text-orange-500">— {holdApprover}</span>}
              </p>
              <p className="text-sm text-orange-700">{holdComment}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} autoComplete="off" className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
        )}

        {/* ── admin 전용: 상태 + 부서 변경 ── */}
        {isAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">⚙ 관리자 설정</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">신청 상태 변경</label>
                <select value={adminStatus} onChange={e => { setAdminStatus(e.target.value); setAdminNote(''); }}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                  {ADMIN_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {adminStatus !== currentStatus && (
                  <p className="text-xs text-amber-600 mt-1">
                    {REQUEST_STATUS_LABELS[currentStatus]} → <strong>{REQUEST_STATUS_LABELS[adminStatus] || adminStatus}</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">부서 변경</label>
                <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                  <option value="">선택 안함 (유지)</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            {/* 상태 변경 시 사유 입력 */}
            {adminStatus !== currentStatus && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  상태 변경 사유
                  <span className="ml-1 text-gray-400 font-normal">(결재 현황에 기록됩니다)</span>
                </label>
                <textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder={`${REQUEST_STATUS_LABELS[currentStatus] || currentStatus} → ${REQUEST_STATUS_LABELS[adminStatus] || adminStatus} 변경 사유를 입력하세요`}
                  rows={2}
                  className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* 사용목적 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">사용목적 <span className="text-red-500">*</span></label>
            <select
              value={purposeMode === 'direct' ? DIRECT_INPUT_VALUE : purposeId}
              onChange={handlePurposeChange}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">선택하세요</option>
              {purposes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={DIRECT_INPUT_VALUE}>✏️ 직접 입력</option>
            </select>
            {purposeMode === 'direct' && (
              <div className="mt-2">
                <input name="custom_purpose" value={form.custom_purpose} onChange={handleChange}
                  placeholder="사용목적 직접 입력 (최대 20자)" maxLength={20}
                  className="w-full px-3 py-2.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-gray-400 mt-1 text-right">{form.custom_purpose.length}/20자</p>
              </div>
            )}
          </div>

          {/* 차량군 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">차량군 <span className="text-red-500">*</span></label>
            <select value={vehicleGroupId} onChange={e => setVehicleGroupId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">선택하세요</option>
              {vehicleGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">목적지 <span className="text-red-500">*</span></label>
          <input name="destination" value={form.destination} onChange={handleChange} required
            placeholder="목적지를 입력하세요"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">탑승 인원 <span className="text-red-500">*</span></label>
          <input name="passengers" type="number" value={form.passengers} onChange={handleChange} min={1} max={50} required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">출발 일시 <span className="text-red-500">*</span></label>
            <input name="start_datetime" type="datetime-local" value={form.start_datetime} onChange={handleChange} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">반납 일시 <span className="text-red-500">*</span></label>
            <input name="end_datetime" type="datetime-local" value={form.end_datetime} onChange={handleChange} required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
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
              버스 차량군 — 배차 시 차량위원회에서 기사를 지정합니다
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <input
                name="driver_name"
                value={form.driver_name}
                onChange={handleChange}
                placeholder="운전기사 이름"
                maxLength={30}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                name="driver_phone"
                type="tel"
                value={form.driver_phone}
                onChange={handleChange}
                placeholder="연락처 (예: 010-1234-5678)"
                maxLength={20}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
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
            {loading ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </form>
    </div>
  );
}
