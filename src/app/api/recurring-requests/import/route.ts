import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

/**
 * 엑셀 파싱은 클라이언트(브라우저)에서 처리 후 JSON 배열로 전송
 * POST body: { rows: RecurringRequestRow[] }
 */

interface RecurringRequestRow {
  title: string;
  department_name: string;
  purpose_name?: string;
  custom_purpose?: string;
  vehicle_group_name: string;
  destination: string;
  passengers?: number;
  driver_name?: string;
  driver_phone?: string;
  period_start: string;       // YYYY-MM-DD
  period_end: string;         // YYYY-MM-DD
  pattern_type: string;       // weekly|biweekly|monthly_date|monthly_weekday
  weekdays?: string;          // "월,수,금" 형식
  monthly_dates?: string;     // "1,15" 형식
  week_of_month?: number;     // 1~5, -1
  weekday_label?: string;     // "월" 등 (monthly_weekday 시)
  start_time: string;         // HH:MM
  end_time: string;           // HH:MM
  reason?: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

const PATTERN_MAP: Record<string, string> = {
  '매주': 'weekly', '주간': 'weekly', 'weekly': 'weekly',
  '격주': 'biweekly', 'biweekly': 'biweekly',
  '매월특정일': 'monthly_date', '매월 특정일': 'monthly_date', 'monthly_date': 'monthly_date',
  '매월n번째요일': 'monthly_weekday', '매월 n번째 요일': 'monthly_weekday', 'monthly_weekday': 'monthly_weekday',
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '관리자만 업로드할 수 있습니다' }, { status: 403 });
    }

    const body = await request.json();
    const rows: RecurringRequestRow[] = body.rows || [];
    if (rows.length === 0) {
      return Response.json({ data: null, error: '업로드할 데이터가 없습니다' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 부서·목적·차량군 마스터 데이터 로드
    const [{ data: depts }, { data: purposes }, { data: groups }] = await Promise.all([
      supabase.from('departments').select('id, name'),
      supabase.from('purposes').select('id, name'),
      supabase.from('vehicle_groups').select('id, name'),
    ]);

    const deptMap = Object.fromEntries((depts || []).map((d: any) => [d.name, d.id]));
    const purposeMap = Object.fromEntries((purposes || []).map((p: any) => [p.name, p.id]));
    const groupMap = Object.fromEntries((groups || []).map((g: any) => [g.name, g.id]));

    const errors: string[] = [];
    const payloads: any[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // 엑셀 행 번호 (헤더=1)

      const deptId = deptMap[row.department_name];
      if (!deptId) { errors.push(`행 ${rowNum}: 부서 '${row.department_name}'을 찾을 수 없습니다`); return; }

      const groupId = groupMap[row.vehicle_group_name];
      if (!groupId) { errors.push(`행 ${rowNum}: 차량군 '${row.vehicle_group_name}'을 찾을 수 없습니다`); return; }

      const purposeId = row.purpose_name ? purposeMap[row.purpose_name] : null;
      if (row.purpose_name && !purposeId && !row.custom_purpose) {
        errors.push(`행 ${rowNum}: 사용목적 '${row.purpose_name}'을 찾을 수 없습니다`);
        return;
      }

      const patternType = PATTERN_MAP[(row.pattern_type || '').toLowerCase().replace(/\s/g, '')];
      if (!patternType) { errors.push(`행 ${rowNum}: 반복유형 '${row.pattern_type}'이 올바르지 않습니다`); return; }

      // 요일 파싱
      let weekdays: number[] | null = null;
      if (['weekly', 'biweekly'].includes(patternType) && row.weekdays) {
        weekdays = row.weekdays.split(/[,，\s]+/).map(d => WEEKDAY_MAP[d.trim()]).filter(d => d !== undefined);
        if (weekdays.length === 0) { errors.push(`행 ${rowNum}: 요일을 입력해주세요`); return; }
      }

      // 날짜 파싱
      let monthlyDates: number[] | null = null;
      if (patternType === 'monthly_date' && row.monthly_dates) {
        monthlyDates = String(row.monthly_dates).split(/[,，\s]+/).map(Number).filter(n => n >= 1 && n <= 31);
        if (monthlyDates.length === 0) { errors.push(`행 ${rowNum}: 매월 특정일을 입력해주세요`); return; }
      }

      // monthly_weekday 파싱
      let weekOfMonth: number | null = null;
      let weekday: number | null = null;
      if (patternType === 'monthly_weekday') {
        weekOfMonth = Number(row.week_of_month) || null;
        weekday = row.weekday_label ? (WEEKDAY_MAP[row.weekday_label] ?? null) : null;
        if (weekOfMonth === null || weekday === null) {
          errors.push(`행 ${rowNum}: N번째 주와 요일을 입력해주세요`);
          return;
        }
      }

      payloads.push({
        title: row.title,
        requester_id: user.id,
        department_id: deptId,
        purpose_id: purposeId || null,
        custom_purpose: row.custom_purpose || (!purposeId ? row.purpose_name : null) || null,
        vehicle_group_id: groupId,
        destination: row.destination,
        passengers: row.passengers || 1,
        driver_name: row.driver_name || null,
        driver_phone: row.driver_phone || null,
        pattern_type: patternType,
        weekdays,
        monthly_dates: monthlyDates,
        week_of_month: weekOfMonth,
        weekday,
        start_time: row.start_time,
        end_time: row.end_time,
        period_start: row.period_start,
        period_end: row.period_end,
        reason: row.reason || null,
        status: 'upper_approved',
      });
    });

    if (errors.length > 0) {
      return Response.json({ data: null, error: errors.join('\n') }, { status: 400 });
    }

    const { data, error } = await supabase.from('recurring_requests').insert(payloads).select('id, title');
    if (error) return createErrorResponse(error.message);

    return Response.json({
      data,
      error: null,
      message: `${payloads.length}건의 장기 신청이 등록되었습니다`,
    }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
