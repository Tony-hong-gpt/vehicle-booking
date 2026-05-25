'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { describePattern, RECURRING_STATUS_CONFIG } from '@/lib/recurring-utils';

interface RecurringRequest {
  id: string;
  title: string;
  status: string;
  pattern_type: string;
  weekdays: number[] | null;
  monthly_dates: number[] | null;
  week_of_month: number | null;
  weekday: number | null;
  start_time: string;
  end_time: string;
  period_start: string;
  period_end: string;
  generated_count: number;
  created_at: string;
  requester: { name: string } | null;
  department: { name: string } | null;
  vehicle_group: { name: string } | null;
  destination: string;
}

const STATUS_TABS = [
  { value: '', label: '전체' },
  { value: 'upper_approved', label: '총무 검토 대기' },
  { value: 'committee_reviewing', label: '부위원장 결재 대기' },
  { value: 'committee_vice_reviewing', label: '위원장 결재 대기' },
  { value: 'approved', label: '승인 완료' },
  { value: 'rejected', label: '반려' },
];

export default function RecurringRequestsPage() {
  const [items, setItems] = useState<RecurringRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<RecurringRequest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError('');
    try {
      const res = await fetch(`/api/recurring-requests/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { setDeleteError(json.error || '삭제 실패'); return; }
      setDeleteTarget(null);
      load();
    } catch {
      setDeleteError('서버 오류가 발생했습니다');
    } finally {
      setDeleting(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: '100' });
      if (status) params.set('status', status);
      const res = await fetch(`/api/recurring-requests?${params}`);
      const json = await res.json();
      setItems(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]);

  // 엑셀 템플릿 다운로드
  function downloadTemplate() {
    const headers = [
      '제목', '소속', '사용목적', '목적지', '탑승인원',
      '차량군', '운전기사', '기사연락처',
      '기간시작(YYYY-MM-DD)', '기간종료(YYYY-MM-DD)',
      '반복유형(매주/격주/매월특정일/매월N번째요일)',
      '요일(월,화,수 — 매주/격주)', '매월특정일(1,15 — 매월특정일)',
      'N번째주(1~5,-1=마지막 — 매월N번째요일)', '요일(월 — 매월N번째요일)',
      '출발시간(HH:MM)', '반납시간(HH:MM)', '사용사유',
    ];
    const example = [
      '임원 정기 운행', '기획팀', '출장', '서울역', 3,
      '승용차', '홍길동', '010-1234-5678',
      '2025-07-01', '2025-12-31',
      '매주', '월,수,금', '', '', '',
      '09:00', '18:00', '임원 정기 업무 운행',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '장기신청');
    XLSX.writeFile(wb, '장기차량신청_템플릿.xlsx');
  }

  // 엑셀 업로드 처리
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploadSuccess('');
    setUploading(true);

    try {
      const buffer = await file.arrayBuffer();
      // cellDates: true → 날짜 셀을 JS Date 객체로 파싱 (serial 숫자 방지)
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (raw.length < 2) throw new Error('데이터가 없습니다');

      /** Excel Date 객체 또는 시리얼 숫자 → 'YYYY-MM-DD' 문자열
       *
       * XLSX cellDates:true 는 Date 객체를 로컬 자정(local midnight)으로 생성.
       * 한국(UTC+9) 로컬 자정 = UTC 전날 15:00 이므로, UTC 메서드로 추출하면
       * 하루가 당겨지는 오류 발생.
       *
       * 해결: getTimezoneOffset()으로 오프셋을 보정한 뒤 ISO 문자열의
       * 앞 10자리(날짜 부분)만 가져오면 UTC/로컬 midnight 모두 정확히 처리됨.
       */
      function toDateStr(v: any): string {
        if (!v && v !== 0) return '';
        if (v instanceof Date) {
          // 타임존 오프셋 보정: new Date(v - offsetMs) 를 UTC 문자열로 변환하면
          // 항상 로컬 기준 날짜를 정확히 얻을 수 있음
          const local = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
          return local.toISOString().slice(0, 10);
        }
        if (typeof v === 'number') {
          // Excel 시리얼 → UTC 기반 날짜 문자열 (timezone 무관)
          const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
          return dt.toISOString().slice(0, 10);
        }
        return String(v);
      }

      /** Excel 시간 분수(0~1) 또는 Date 객체 → 'HH:MM' 문자열 */
      function toTimeStr(v: any): string {
        if (!v && v !== 0) return '';
        if (v instanceof Date) {
          // 날짜와 동일한 오프셋 보정 적용
          const local = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
          return local.toISOString().slice(11, 16); // 'HH:MM'
        }
        if (typeof v === 'number') {
          if (v < 1) {
            // 시간 분수: 0.375 = 09:00
            const totalMin = Math.round(v * 24 * 60);
            const h = Math.floor(totalMin / 60);
            const min = totalMin % 60;
            return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
          }
          // 1 이상이면 날짜+시간 혼합 시리얼 (소수 부분만 추출)
          const timePart = v - Math.floor(v);
          const totalMin = Math.round(timePart * 24 * 60);
          const h = Math.floor(totalMin / 60);
          const min = totalMin % 60;
          return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        }
        return String(v);
      }

      const rows = raw.slice(1).filter(r => r.some(Boolean)).map(r => ({
        title: String(r[0] || ''),
        department_name: String(r[1] || ''),
        purpose_name: r[2] ? String(r[2]) : undefined,
        destination: String(r[3] || ''),
        passengers: r[4] ? Number(r[4]) : 1,
        vehicle_group_name: String(r[5] || ''),
        driver_name: r[6] ? String(r[6]) : undefined,
        driver_phone: r[7] ? String(r[7]) : undefined,
        period_start: toDateStr(r[8]),
        period_end: toDateStr(r[9]),
        pattern_type: String(r[10] || ''),
        weekdays: r[11] ? String(r[11]) : undefined,
        monthly_dates: r[12] ? String(r[12]) : undefined,
        week_of_month: r[13] ? Number(r[13]) : undefined,
        weekday_label: r[14] ? String(r[14]) : undefined,
        start_time: toTimeStr(r[15]) || String(r[15] || ''),
        end_time: toTimeStr(r[16]) || String(r[16] || ''),
        reason: r[17] ? String(r[17]) : undefined,
      }));

      const res = await fetch('/api/recurring-requests/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setUploadSuccess(json.message);
      load();
    } catch (err: any) {
      setUploadError(err.message || '업로드 중 오류가 발생했습니다');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">장기 차량 신청</h1>
          <p className="text-sm text-gray-500 mt-1">반복 패턴 차량 사용을 등록·관리합니다</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            엑셀 템플릿
          </button>
          <label className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? '업로드 중...' : '엑셀 업로드'}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
          </label>
          <Link
            href="/recurring-requests/new"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            신규 등록
          </Link>
        </div>
      </div>

      {/* 업로드 결과 메시지 */}
      {uploadSuccess && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex justify-between">
          {uploadSuccess}
          <button onClick={() => setUploadSuccess('')} className="text-green-500 hover:text-green-700">✕</button>
        </div>
      )}
      {uploadError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 whitespace-pre-wrap flex justify-between">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError('')} className="text-red-400 hover:text-red-600 flex-shrink-0 ml-2">✕</button>
        </div>
      )}

      {/* 상태 탭 */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              status === tab.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>장기 차량 신청이 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['제목', '소속', '목적지', '차량군', '반복 패턴', '적용 기간', '시간', '상태', '생성건수', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(item => {
                  const cfg = RECURRING_STATUS_CONFIG[item.status] || RECURRING_STATUS_CONFIG['upper_approved'];
                  const pattern = describePattern({
                    pattern_type: item.pattern_type as any,
                    weekdays: item.weekdays || undefined,
                    monthly_dates: item.monthly_dates || undefined,
                    week_of_month: item.week_of_month ?? undefined,
                    weekday: item.weekday ?? undefined,
                    start_time: item.start_time,
                    end_time: item.end_time,
                    period_start: item.period_start,
                    period_end: item.period_end,
                  });
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{item.title}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.department?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.destination}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.vehicle_group?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{pattern}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                        {item.period_start} ~ {item.period_end}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.start_time} ~ {item.end_time}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-center whitespace-nowrap">
                        {item.status === 'approved' ? `${item.generated_count}건` : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/recurring-requests/${item.id}`}
                            className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                          >
                            상세 →
                          </Link>
                          <button
                            onClick={() => { setDeleteTarget(item); setDeleteError(''); }}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                            title="삭제"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">장기 신청 삭제</h3>
                <p className="text-sm text-gray-500">이 작업은 되돌릴 수 없습니다</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-sm font-medium text-gray-800">{deleteTarget.title}</p>
              <p className="text-xs text-gray-500 mt-1">
                {deleteTarget.department?.name || '-'} · {deleteTarget.period_start} ~ {deleteTarget.period_end}
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
              <p className="text-xs text-amber-700">
                ⚠️ 장기 신청을 삭제해도 이미 생성된 개별 신청 건은 보존됩니다.
                반복 패턴 정보와 결재 내역만 삭제됩니다.
              </p>
            </div>

            {deleteError && (
              <p className="text-sm text-red-600 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
