/**
 * 장기 차량 신청 반복 패턴 날짜 생성 유틸
 */

export interface RecurringPattern {
  pattern_type: 'weekly' | 'biweekly' | 'monthly_date' | 'monthly_weekday';
  weekdays?: number[];       // 0=일 1=월 2=화 3=수 4=목 5=금 6=토
  monthly_dates?: number[];  // 1~31
  week_of_month?: number;    // 1~5, -1=마지막 주
  weekday?: number;          // 0~6
  start_time: string;        // 'HH:MM'
  end_time: string;          // 'HH:MM'
  period_start: string;      // 'YYYY-MM-DD'
  period_end: string;        // 'YYYY-MM-DD'
}

/** 해당 날짜가 그 달의 몇 번째 weekday인지 반환 (1~5) */
function getWeekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/** 해당 달의 해당 요일 중 마지막인지 확인 */
function isLastWeekdayOfMonth(date: Date): boolean {
  const nextWeek = new Date(date);
  nextWeek.setDate(date.getDate() + 7);
  return nextWeek.getMonth() !== date.getMonth();
}

/** period_start가 속한 주의 월요일(ISO 기준) 반환 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 반복 패턴에 따라 생성될 날짜 배열을 반환
 * 반환값: [{ date: Date, startISO: string, endISO: string }]
 */
export function generateRecurringDates(pattern: RecurringPattern): {
  date: Date;
  startISO: string;
  endISO: string;
}[] {
  const results: { date: Date; startISO: string; endISO: string }[] = [];

  const [startH, startM] = pattern.start_time.split(':').map(Number);
  const [endH, endM] = pattern.end_time.split(':').map(Number);

  const periodEnd = new Date(pattern.period_end + 'T23:59:59');
  const startMonday = getMonday(new Date(pattern.period_start));

  function makeEntry(date: Date) {
    const startDT = new Date(date);
    startDT.setHours(startH, startM, 0, 0);
    const endDT = new Date(date);
    // 종료 시간이 시작보다 작으면 다음날 (야간 운행)
    if (endH < startH || (endH === startH && endM <= startM)) {
      endDT.setDate(endDT.getDate() + 1);
    }
    endDT.setHours(endH, endM, 0, 0);
    return {
      date: new Date(date),
      startISO: startDT.toISOString(),
      endISO: endDT.toISOString(),
    };
  }

  const current = new Date(pattern.period_start + 'T00:00:00');

  while (current <= periodEnd) {
    const dow = current.getDay(); // 0=일 1=월 ... 6=토

    switch (pattern.pattern_type) {
      case 'weekly':
        if (pattern.weekdays?.includes(dow)) {
          results.push(makeEntry(current));
        }
        break;

      case 'biweekly': {
        // 시작일이 속한 주(월요일 기준)와의 주 차이가 짝수이면 활성 주
        const currentMonday = getMonday(current);
        const weekDiff = Math.round(
          (currentMonday.getTime() - startMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        if (weekDiff % 2 === 0 && pattern.weekdays?.includes(dow)) {
          results.push(makeEntry(current));
        }
        break;
      }

      case 'monthly_date':
        if (pattern.monthly_dates?.includes(current.getDate())) {
          results.push(makeEntry(current));
        }
        break;

      case 'monthly_weekday':
        if (dow === pattern.weekday) {
          const wom = getWeekOfMonth(current);
          const isLast = isLastWeekdayOfMonth(current);
          if (pattern.week_of_month === -1 ? isLast : wom === pattern.week_of_month) {
            results.push(makeEntry(current));
          }
        }
        break;
    }

    current.setDate(current.getDate() + 1);
  }

  return results;
}

/** 패턴 한국어 요약 문자열 */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function describePattern(pattern: RecurringPattern): string {
  switch (pattern.pattern_type) {
    case 'weekly': {
      const days = (pattern.weekdays || []).map(d => WEEKDAY_LABELS[d]).join('·');
      return `매주 ${days}요일`;
    }
    case 'biweekly': {
      const days = (pattern.weekdays || []).map(d => WEEKDAY_LABELS[d]).join('·');
      return `격주 ${days}요일`;
    }
    case 'monthly_date': {
      const dates = (pattern.monthly_dates || []).join('일·');
      return `매월 ${dates}일`;
    }
    case 'monthly_weekday': {
      const wom = pattern.week_of_month === -1 ? '마지막' : `${pattern.week_of_month}번째`;
      const day = WEEKDAY_LABELS[pattern.weekday ?? 0];
      return `매월 ${wom} ${day}요일`;
    }
    default:
      return '-';
  }
}

export const WEEKDAY_OPTIONS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

export const WEEK_OF_MONTH_OPTIONS = [
  { value: 1, label: '첫째' },
  { value: 2, label: '둘째' },
  { value: 3, label: '셋째' },
  { value: 4, label: '넷째' },
  { value: -1, label: '마지막' },
];

export const PATTERN_TYPE_OPTIONS = [
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '격주' },
  { value: 'monthly_date', label: '매월 특정일' },
  { value: 'monthly_weekday', label: '매월 N번째 요일' },
];

export const RECURRING_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  upper_approved:           { label: '총무 검토 대기',     color: 'text-indigo-700',  bg: 'bg-indigo-50',  dot: 'bg-indigo-400' },
  committee_reviewing:      { label: '부위원장 결재 대기', color: 'text-violet-700',  bg: 'bg-violet-50',  dot: 'bg-violet-400' },
  committee_vice_reviewing: { label: '위원장 결재 대기',   color: 'text-fuchsia-700', bg: 'bg-fuchsia-50', dot: 'bg-fuchsia-400' },
  approved:                 { label: '승인 완료',          color: 'text-green-700',   bg: 'bg-green-50',   dot: 'bg-green-500'  },
  rejected:                 { label: '반려',               color: 'text-red-700',     bg: 'bg-red-50',     dot: 'bg-red-400'    },
  on_hold:                  { label: '보류',               color: 'text-orange-700',  bg: 'bg-orange-50',  dot: 'bg-orange-400' },
  cancelled:                { label: '취소',               color: 'text-gray-500',    bg: 'bg-gray-50',    dot: 'bg-gray-300'   },
};
