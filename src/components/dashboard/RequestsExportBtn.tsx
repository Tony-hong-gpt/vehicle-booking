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

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch('/api/requests/export');
      const json = await res.json();
      if (!json.data) return;

      const rows: any[][] = [];

      // 헤더 행
      const headers = [
        '신청번호', '신청자', '부서', '목적지', '사용목적',
        '차량군', '배차차량', '출발일시', '반납일시',
        '동승인원', '기사명', '기사연락처', '상태',
      ];
      rows.push(headers);

      // 날짜별 그룹화
      const grouped = new Map<string, any[]>();
      for (const req of json.data) {
        const key = getDateKey(req.start_datetime);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(req);
      }

      for (const [, reqs] of grouped) {
        // 날짜 구분 행
        const dateLabel = formatDateHeader(reqs[0].start_datetime);
        rows.push([dateLabel, '', '', '', '', '', '', '', '', '', '', '', '']);

        for (const req of reqs) {
          const vehicle = req.dispatches?.[0]?.vehicle;
          const vehicleLabel = vehicle
            ? `${vehicle.name}${vehicle.model ? ' ' + vehicle.model : ''}${vehicle.license_plate ? ' (' + vehicle.license_plate + ')' : ''}`
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

      // 날짜 구분 행 스타일 (회색 배경)
      const dateRowIndices: number[] = [];
      rows.forEach((row, i) => {
        if (i > 0 && row[1] === '' && row[2] === '') dateRowIndices.push(i);
      });

      // 컬럼 너비 설정
      ws['!cols'] = [
        { wch: 22 }, // 신청번호
        { wch: 10 }, // 신청자
        { wch: 14 }, // 부서
        { wch: 16 }, // 목적지
        { wch: 14 }, // 사용목적
        { wch: 12 }, // 차량군
        { wch: 20 }, // 배차차량
        { wch: 18 }, // 출발일시
        { wch: 18 }, // 반납일시
        { wch: 8  }, // 동승인원
        { wch: 10 }, // 기사명
        { wch: 14 }, // 기사연락처
        { wch: 12 }, // 상태
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '신청현황');

      const today = new Date();
      const fname = `신청현황_${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}.xlsx`;
      XLSX.writeFile(wb, fname);
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}
