const DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
const DAYS_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function kstParts(date: Date) {
  // UTC milliseconds + 9시간 offset → KST
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: String(kst.getUTCFullYear()),
    yy: String(kst.getUTCFullYear()).slice(-2),
    month: String(kst.getUTCMonth() + 1).padStart(2, '0'),
    day: String(kst.getUTCDate()).padStart(2, '0'),
    dow: DAYS_SHORT[kst.getUTCDay()],
    dowLong: DAYS_LONG[kst.getUTCDay()],
    hour: String(kst.getUTCHours()).padStart(2, '0'),
    minute: String(kst.getUTCMinutes()).padStart(2, '0'),
  };
}

export function formatKST(
  dateStr: string | Date | null | undefined,
  pattern: string,
): string {
  if (!dateStr) return '-';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const p = kstParts(date);
  switch (pattern) {
    case 'yy.MM.dd(EEE) HH:mm':
      return `${p.yy}.${p.month}.${p.day}(${p.dow}) ${p.hour}:${p.minute}`;
    case 'yyyy.MM.dd(EEE) HH:mm':
      return `${p.year}.${p.month}.${p.day}(${p.dow}) ${p.hour}:${p.minute}`;
    case 'MM.dd(EEE) HH:mm':
      return `${p.month}.${p.day}(${p.dow}) ${p.hour}:${p.minute}`;
    case 'yyyy.MM.dd HH:mm':
      return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
    case 'MM/dd HH:mm':
      return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
    case 'yyyy년 MM월 dd일 EEEE':
      return `${p.year}년 ${p.month}월 ${p.day}일 ${p.dowLong}`;
    default:
      return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
  }
}
