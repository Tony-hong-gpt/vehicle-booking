'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';

interface CalendarRequest {
  id: string;
  destination: string;
  status: string;
  start_datetime: string;
  end_datetime: string;
  requester?: { name: string };
  purpose?: { name: string };
  custom_purpose?: string;
  vehicle_group?: { name: string };
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; bar: string; pill: string; emoji: string }> = {
  // dot: 범례용 점 색상 / bar: 달력 이벤트 왼쪽 강조 바 / pill: 팝업 배지
  pending:        { label: '상위승인대기', dot: 'bg-amber-400',   bar: 'border-l-amber-400   bg-amber-50   text-amber-800',   pill: 'bg-amber-50 text-amber-800 border-amber-200',    emoji: '🟡' },
  upper_approved: { label: '위원회대기',  dot: 'bg-violet-500',  bar: 'border-l-violet-500  bg-violet-50  text-violet-800',  pill: 'bg-violet-50 text-violet-800 border-violet-200',  emoji: '🔷' },
  on_hold:        { label: '대기',        dot: 'bg-orange-500',  bar: 'border-l-orange-500  bg-orange-50  text-orange-800',  pill: 'bg-orange-50 text-orange-800 border-orange-200',  emoji: '⏸' },
  approved:       { label: '승인',        dot: 'bg-emerald-500', bar: 'border-l-emerald-500 bg-emerald-50 text-emerald-800', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', emoji: '🟢' },
  rejected:       { label: '반려',        dot: 'bg-red-500',     bar: 'border-l-red-500     bg-red-50     text-red-700',     pill: 'bg-red-50 text-red-700 border-red-200',            emoji: '🔴' },
  cancelled:      { label: '취소',        dot: 'bg-slate-400',   bar: 'border-l-slate-400   bg-slate-100  text-slate-500',   pill: 'bg-slate-100 text-slate-500 border-slate-200',     emoji: '⚫' },
  dispatched:     { label: '배차완료',    dot: 'bg-sky-500',     bar: 'border-l-sky-500     bg-sky-50     text-sky-800',     pill: 'bg-sky-50 text-sky-800 border-sky-200',            emoji: '🔵' },
  in_use:         { label: '운행중',      dot: 'bg-teal-500',    bar: 'border-l-teal-500    bg-teal-50    text-teal-800',    pill: 'bg-teal-50 text-teal-800 border-teal-200',         emoji: '🚗' },
  returned:       { label: '반납완료',    dot: 'bg-zinc-400',    bar: 'border-l-zinc-400    bg-zinc-100   text-zinc-500',    pill: 'bg-zinc-100 text-zinc-500 border-zinc-200',        emoji: '⚪' },
};

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function getDateOnly(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function RequestCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [requests, setRequests] = useState<CalendarRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarRequest | null>(null);

  const fetchRequests = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(date).toISOString();
      const monthEnd = endOfMonth(date).toISOString();
      const params = new URLSearchParams({
        month_start: monthStart,
        month_end: monthEnd,
        page_size: '300',
        sort_by: 'start_datetime',
        sort_order: 'asc',
      });
      const res = await fetch(`/api/requests?${params}`);
      const json = await res.json();
      setRequests(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests(currentDate);
  }, [currentDate, fetchRequests]);

  // 날짜별 신청 매핑
  const requestsByDay = new Map<string, CalendarRequest[]>();
  requests.forEach(req => {
    const start = getDateOnly(req.start_datetime);
    const end = getDateOnly(req.end_datetime);
    const cur = new Date(start);
    while (cur <= end) {
      const key = getDayKey(cur);
      if (!requestsByDay.has(key)) requestsByDay.set(key, []);
      requestsByDay.get(key)!.push(req);
      cur.setDate(cur.getDate() + 1);
    }
  });

  // 달력 그리드 생성
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const today = new Date();

  // 달력 주(행) 수 계산 – 셀 높이를 뷰포트에 맞게 동적 계산하기 위함
  const numRows = days.length / 7; // 4, 5, 또는 6
  // 페이지 상단 여백(패딩·헤더·통계카드)과 달력 내부 헤더·요일행 합산 고정 높이
  // p-5(20) + 헤더(54) + mb-4(16) + 통계카드(92) + mb-4(16) + 달력헤더(44) + p-3top(12) + 요일행(28) + border(1) + 여유(15) = 298px
  const OVERHEAD_PX = 323;
  const gridStyle: React.CSSProperties = {
    height: `calc(100vh - ${OVERHEAD_PX}px)`,
    gridAutoRows: '1fr',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {format(currentDate, 'yyyy년 MM월', { locale: ko })}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentDate(d => subMonths(d, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none"
            >‹</button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2.5 py-1 rounded-lg hover:bg-gray-100 text-xs font-medium text-gray-500"
            >오늘</button>
            <button
              onClick={() => setCurrentDate(d => addMonths(d, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none"
            >›</button>
          </div>
          {loading && <span className="text-xs text-gray-400 animate-pulse">불러오는 중...</span>}
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-3 h-2.5 rounded-sm flex-shrink-0 border-l-4 ${cfg.bar}`} />
              {cfg.label}
            </span>
          ))}
        </div>
      </div>

      {/* 달력 */}
      <div className="p-3">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_OF_WEEK.map((d, i) => (
            <div key={d} className={`text-center text-xs font-semibold py-1.5 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 – 높이를 뷰포트 기준으로 동적 계산하여 스크롤 없이 전체 달력 표시 */}
        <div className="grid grid-cols-7 border-t border-l border-gray-100" style={gridStyle}>
          {days.map(day => {
            const key = getDayKey(day);
            const dayReqs = requestsByDay.get(key) || [];
            const isThisMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, today);
            const isSun = day.getDay() === 0;
            const isSat = day.getDay() === 6;
            const MAX_SHOW = numRows <= 4 ? 4 : 3;
            const shown = dayReqs.slice(0, MAX_SHOW);
            const overflow = dayReqs.length - MAX_SHOW;

            return (
              <div
                key={key}
                className={`border-b border-r border-gray-100 p-1.5 transition-colors overflow-hidden
                  ${!isThisMonth ? 'bg-gray-50/50' : 'bg-white'}
                `}
              >
                {/* 날짜 숫자 */}
                <div className="flex justify-end mb-1">
                  <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium
                    ${isToday ? 'bg-blue-600 text-white' : isSun ? 'text-red-400' : isSat ? 'text-blue-500' : 'text-gray-500'}
                    ${!isThisMonth ? 'opacity-40' : ''}
                  `}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* 이벤트 */}
                <div className="space-y-0.5">
                  {shown.map(req => {
                    const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending;
                    const isStart = isSameDay(day, getDateOnly(req.start_datetime));
                    return (
                      <button
                        key={`${req.id}-${key}`}
                        onClick={() => setSelectedEvent(req)}
                        className={`w-full flex items-center px-1.5 py-0.5 rounded-r border-l-4 text-left
                          text-xs truncate transition-opacity hover:opacity-75 ${cfg.bar}
                          ${!isThisMonth ? 'opacity-50' : ''}`}
                      >
                        <span className="truncate leading-tight">
                          {isStart ? '' : '↳ '}{req.destination}
                        </span>
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <div className="text-xs text-gray-400 px-1.5 cursor-default">+{overflow}개 더</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 이벤트 상세 팝업 */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            {/* 상태 배지 */}
            {(() => {
              const cfg = STATUS_CONFIG[selectedEvent.status] ?? STATUS_CONFIG.pending;
              return (
                <div className="flex items-center gap-2 mb-4">
                  <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                    {cfg.emoji} {cfg.label}
                  </span>
                </div>
              );
            })()}

            <h3 className="text-lg font-bold text-gray-900 mb-4">{selectedEvent.destination}</h3>

            <div className="space-y-2 text-sm text-gray-600 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">신청자</span>
                <span className="font-medium">{selectedEvent.requester?.name ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">사용목적</span>
                <span className="font-medium">{selectedEvent.purpose?.name ?? selectedEvent.custom_purpose ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">차량군</span>
                <span className="font-medium">{selectedEvent.vehicle_group?.name ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">출발</span>
                <span className="font-medium">
                  {format(new Date(selectedEvent.start_datetime), 'MM/dd(EEE) HH:mm', { locale: ko })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">반납</span>
                <span className="font-medium">
                  {format(new Date(selectedEvent.end_datetime), 'MM/dd(EEE) HH:mm', { locale: ko })}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedEvent(null)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                닫기
              </button>
              <Link
                href={`/requests/${selectedEvent.id}`}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium text-center transition-colors"
                onClick={() => setSelectedEvent(null)}
              >
                상세 보기 →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
