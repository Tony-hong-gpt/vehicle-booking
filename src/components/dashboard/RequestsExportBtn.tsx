'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';

const STATUS_LABELS: Record<string, string> = {
  pending:        '상위승인대기',
  upper_approved: '위원회대기',
  approved:       '승인',
  rejected:       '반려',
  dispatched:     '배차완료',
};

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateHeader(dt: string): string {
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_KO[d.getDay()];
  return `${y}.${m}.${day}, (${dow})`;
}

function formatDatetime(dt: string): string {
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

function getDateKey(dt: string): string {
  const d = new Date(dt);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function RequestsExportBtn() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/requests/export');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `서버 오류 (${res.status})`);
      }

      const json = await res.json();
      const records: any[] = json.data ?? [];

      const rows: any[][] = [];

      // 헤더 행
      rows.push([
        '신청번호', '신청자', '부서', '목적지', '사용목적',
        '차량군', '배차차량', '출발일시', '반납일시',
        '동승인원', '기사명', '기사연락처', '상태',
      ]);

      // 날짜별 그룹화 (출발일 기준, Map으로 순서 유지)
      const grouped = new Map<string, any[]>();
      for (const req of records) {
        const key = getDateKey(req.start_datetime);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(req);
      }

      for (const reqs of grouped.values()) {
        // 날짜 구분 행 (A열만 채우고 나머지 빈칸)
        const dateLabel = formatDateHeader(reqs[0].start_datetime);
        rows.push([dateLabel, '', '', '', '', '', '', '', '', '', '', '', '']);

        for (const req of reqs) {
          const vehicle = req.dispatches?.[0]?.vehicle;
          const vehicleLabel = vehicle
            ? [vehicle.name, vehicle.model, vehicle.license_plate ? `(${vehicle.license_plate})` : '']
                .filter(Boolean).join(' ')
            : '-';

          rows.push([
            req.request_no ?? '',
            req.requester?.name ?? '',
            req.department?.name ?? '',
            req.destination ?? '',
            req.purpose?.name ?? '',
            req.vehicle_group?.name ?? '',
            vehicleLabel,
            formatDatetime(req.start_datetime),
            formatDatetime(req.end_datetime),
            req.passengers ?? 0,
            req.driver_name ?? '-',
            req.driver_phone ?? '-',
            STATUS_LABELS[req.status] ?? req.status,
          ]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // 컬럼 너비
      ws['!cols'] = [
        { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
        { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
        { wch: 8  }, { wch: 10 }, { wch: 14 }, { wch: 12 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '신청현황');

      // blob URL 방식으로 다운로드 (브라우저 호환성)
      const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob  = new Blob([wbOut], { type: 'application/octet-stream' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      const today = new Date();
      a.href     = url;
      a.download = `신청현황_${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message ?? '다운로드 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-2 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
      >
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {loading ? '다운로드 중...' : '엑셀 다운로드'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
