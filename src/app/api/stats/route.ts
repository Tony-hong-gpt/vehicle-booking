import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import {
  format, subDays, subMonths, subYears,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
} from 'date-fns';
import { ko } from 'date-fns/locale';

// period: 'week' | 'month' | 'year'
function getPeriodRange(period: string, now: Date) {
  switch (period) {
    case 'week':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'year':
      return { from: startOfYear(now), to: endOfYear(now) };
    case 'month':
    default:
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

// 이전 동일 기간 범위
function getPrevPeriodRange(period: string, now: Date) {
  switch (period) {
    case 'week':  return getPeriodRange('week', subDays(now, 7));
    case 'year':  return getPeriodRange('year', subYears(now, 1));
    case 'month':
    default:      return getPeriodRange('month', subMonths(now, 1));
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const type   = searchParams.get('type')   || 'overview';
    const period = searchParams.get('period') || 'month'; // week | month | year
    // 다른 탭용 months 파라미터 (하위 호환)
    const months = parseInt(searchParams.get('months') || '6');

    const supabase = createAdminClient();
    const now = new Date();

    // ── 1. 개요 (통계 대시보드) ───────────────────────────────────────
    if (type === 'overview') {
      const { from, to } = getPeriodRange(period, now);
      const { from: prevFrom, to: prevTo } = getPrevPeriodRange(period, now);

      const fromISO    = from.toISOString();
      const toISO      = to.toISOString();
      const prevFromISO = prevFrom.toISOString();
      const prevToISO   = prevTo.toISOString();

      const [vehiclesRes, reqCurrRes, reqPrevRes, dispCurrRes, dispPrevRes] = await Promise.all([
        supabase.from('vehicles').select('id, status'),
        supabase.from('requests').select('id, status, created_at').gte('created_at', fromISO).lte('created_at', toISO),
        supabase.from('requests').select('id, status, created_at').gte('created_at', prevFromISO).lte('created_at', prevToISO),
        supabase.from('dispatches').select('id, status, vehicle_id, scheduled_start').gte('scheduled_start', fromISO).lte('scheduled_start', toISO),
        supabase.from('dispatches').select('id, status').gte('scheduled_start', prevFromISO).lte('scheduled_start', prevToISO),
      ]);

      const vehicles  = vehiclesRes.data  || [];
      const reqCurr   = reqCurrRes.data   || [];
      const reqPrev   = reqPrevRes.data   || [];
      const dispCurr  = dispCurrRes.data  || [];
      const dispPrev  = dispPrevRes.data  || [];

      // 현재 기간 집계
      const totalReqs      = reqCurr.length;
      const approvedReqs   = reqCurr.filter(r => ['dispatched','in_use','returned'].includes(r.status)).length;
      const cancelledReqs  = reqCurr.filter(r => r.status === 'cancelled').length;
      const pendingReqs    = reqCurr.filter(r => ['pending','upper_approved','approved'].includes(r.status)).length;
      const approvalRate   = totalReqs > 0 ? Math.round((approvedReqs / (totalReqs - pendingReqs || 1)) * 100) : 0;

      const completedDisp  = dispCurr.filter(d => d.status === 'completed').length;
      const totalDisp      = dispCurr.length;
      const usedVehicleIds = new Set(dispCurr.map((d: any) => d.vehicle_id).filter(Boolean));
      const activeVehicles = vehicles.filter(v => v.status !== 'inactive').length;
      const utilizationRate = activeVehicles > 0 ? Math.round((usedVehicleIds.size / activeVehicles) * 100) : 0;

      // 전기간 대비 증감
      const prevTotalReqs = reqPrev.length;
      const prevCompletedDisp = dispPrev.filter((d: any) => d.status === 'completed').length;

      const diff = (curr: number, prev: number) =>
        prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

      // 기간 내 일별/주별/월별 시계열 데이터
      let timeSeries: any[] = [];
      if (period === 'week') {
        timeSeries = eachDayOfInterval({ start: from, end: to }).map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          return {
            label: format(day, 'EEE', { locale: ko }),
            requests:   reqCurr.filter(r => r.created_at?.startsWith(dayStr)).length,
            dispatches: dispCurr.filter(d => d.scheduled_start?.startsWith(dayStr)).length,
          };
        });
      } else if (period === 'month') {
        // 주별 집계
        const weeks = eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 });
        timeSeries = weeks.map((weekStart, i) => {
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
          const wFrom = weekStart.toISOString();
          const wTo   = weekEnd.toISOString();
          return {
            label: `${i + 1}주`,
            requests:   reqCurr.filter(r => r.created_at >= wFrom && r.created_at <= wTo).length,
            dispatches: dispCurr.filter(d => d.scheduled_start >= wFrom && d.scheduled_start <= wTo).length,
          };
        });
      } else {
        // 연간: 월별
        timeSeries = eachMonthOfInterval({ start: from, end: to }).map(monthStart => {
          const mEnd = endOfMonth(monthStart).toISOString();
          const mFrom = monthStart.toISOString();
          return {
            label: format(monthStart, 'M월'),
            requests:   reqCurr.filter(r => r.created_at >= mFrom && r.created_at <= mEnd).length,
            dispatches: dispCurr.filter(d => d.scheduled_start >= mFrom && d.scheduled_start <= mEnd).length,
          };
        });
      }

      return Response.json({
        data: {
          period_label: period === 'week' ? '이번 주' : period === 'month' ? '이번 달' : '올해',
          kpi: {
            total_requests:   { value: totalReqs,       diff: diff(totalReqs, prevTotalReqs) },
            approval_rate:    { value: approvalRate,     unit: '%' },
            completed_trips:  { value: completedDisp,   diff: diff(completedDisp, prevCompletedDisp) },
            utilization_rate: { value: utilizationRate,  unit: '%' },
          },
          requests: { total: totalReqs, approved: approvedReqs, cancelled: cancelledReqs, pending: pendingReqs },
          dispatches: {
            total:       totalDisp,
            completed:   completedDisp,
            scheduled:   dispCurr.filter(d => d.status === 'scheduled').length,
            in_progress: dispCurr.filter(d => d.status === 'in_progress').length,
          },
          vehicles: {
            total:    activeVehicles,
            used:     usedVehicleIds.size,
            unused:   activeVehicles - usedVehicleIds.size,
          },
          time_series: timeSeries,
        },
        error: null,
      });
    }

    // ── 2. 월별 신청/배차 현황 ────────────────────────────────────────
    if (type === 'monthly') {
      // period 기반으로 그룹 단위 결정
      const periodMonths = period === 'week' ? 1 : period === 'year' ? 12 : 6;
      const useMonths    = months || periodMonths;
      const fromDate = startOfMonth(subMonths(now, useMonths - 1)).toISOString();

      const [requestsRes, dispatchesRes] = await Promise.all([
        supabase.from('requests').select('status, created_at').gte('created_at', fromDate),
        supabase.from('dispatches').select('status, scheduled_start').gte('scheduled_start', fromDate),
      ]);

      const requests   = requestsRes.data   || [];
      const dispatches = dispatchesRes.data || [];

      const monthly: Record<string, any> = {};
      for (let i = useMonths - 1; i >= 0; i--) {
        const d   = subMonths(now, i);
        const key = format(d, 'yyyy-MM');
        monthly[key] = { month: format(d, 'M월'), requests: 0, approved: 0, cancelled: 0, dispatches: 0 };
      }

      requests.forEach((r: any) => {
        const key = r.created_at?.slice(0, 7);
        if (!monthly[key]) return;
        monthly[key].requests++;
        if (['dispatched','in_use','returned'].includes(r.status)) monthly[key].approved++;
        if (r.status === 'cancelled') monthly[key].cancelled++;
      });

      dispatches.forEach((d: any) => {
        const key = d.scheduled_start?.slice(0, 7);
        if (monthly[key]) monthly[key].dispatches++;
      });

      return Response.json({ data: Object.values(monthly), error: null });
    }

    // ── 3. 차량 가동률 ────────────────────────────────────────────────
    if (type === 'utilization') {
      const periodMonths = period === 'year' ? 12 : period === 'week' ? 1 : 6;
      const useMonths    = months || periodMonths;
      const fromDate     = startOfMonth(subMonths(now, useMonths - 1)).toISOString();
      const toDate       = endOfMonth(now).toISOString();

      const [vehiclesRes, dispatchesRes] = await Promise.all([
        supabase.from('vehicles')
          .select('id, name, model, license_plate, vehicle_group:vehicle_groups(name)')
          .neq('status', 'inactive'),
        supabase.from('dispatches')
          .select('vehicle_id, scheduled_start, status')
          .gte('scheduled_start', fromDate)
          .lte('scheduled_start', toDate)
          .neq('status', 'cancelled'),
      ]);

      const vehicles   = vehiclesRes.data   || [];
      const dispatches = dispatchesRes.data || [];

      const usageMap: Record<string, number> = {};
      dispatches.forEach((d: any) => {
        if (d.vehicle_id) usageMap[d.vehicle_id] = (usageMap[d.vehicle_id] || 0) + 1;
      });

      const monthlyUtil: Record<string, any> = {};
      for (let i = useMonths - 1; i >= 0; i--) {
        const d      = subMonths(now, i);
        const key    = format(d, 'yyyy-MM');
        const mStart = startOfMonth(d).toISOString();
        const mEnd   = endOfMonth(d).toISOString();
        const mDisp  = dispatches.filter((d: any) => d.scheduled_start >= mStart && d.scheduled_start <= mEnd);
        const usedVehicles = new Set(mDisp.map((d: any) => d.vehicle_id).filter(Boolean)).size;
        monthlyUtil[key] = {
          month: format(d, 'M월'),
          used:  usedVehicles,
          total: vehicles.length,
          rate:  vehicles.length > 0 ? Math.round((usedVehicles / vehicles.length) * 100) : 0,
        };
      }

      const vehicleUsage = vehicles
        .map((v: any) => ({
          id: v.id,
          name: [v.name, v.model].filter(Boolean).join(' '),
          license_plate: v.license_plate,
          group: v.vehicle_group?.name || '-',
          count: usageMap[v.id] || 0,
        }))
        .sort((a: any, b: any) => b.count - a.count);

      return Response.json({
        data: { monthly: Object.values(monthlyUtil), vehicles: vehicleUsage },
        error: null,
      });
    }

    // ── 4. 부서별 사용 현황 ───────────────────────────────────────────
    if (type === 'departments') {
      const periodMonths = period === 'year' ? 12 : period === 'week' ? 1 : 6;
      const useMonths    = months || periodMonths;
      const fromDate     = startOfMonth(subMonths(now, useMonths - 1)).toISOString();

      const requestsRes = await supabase
        .from('requests')
        .select('department:departments(name), start_datetime')
        .gte('created_at', fromDate)
        .in('status', ['dispatched','in_use','returned']);

      const requests = requestsRes.data || [];

      const deptMap: Record<string, number> = {};
      requests.forEach((r: any) => {
        const name = r.department?.name || '미지정';
        deptMap[name] = (deptMap[name] || 0) + 1;
      });

      const topDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);

      const monthlyDept: Record<string, any> = {};
      for (let i = useMonths - 1; i >= 0; i--) {
        const d   = subMonths(now, i);
        const key = format(d, 'yyyy-MM');
        const row: Record<string, any> = { month: format(d, 'M월') };
        topDepts.forEach(dept => { row[dept] = 0; });
        monthlyDept[key] = row;
      }

      requests.forEach((r: any) => {
        if (!r.start_datetime) return;
        const key  = r.start_datetime.slice(0, 7);
        const name = r.department?.name || '미지정';
        if (monthlyDept[key] && topDepts.includes(name)) monthlyDept[key][name]++;
      });

      return Response.json({
        data: {
          ranking:   Object.entries(deptMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
          monthly:   Object.values(monthlyDept),
          top_depts: topDepts,
        },
        error: null,
      });
    }

    // ── 5. 목적지/사용목적 분석 ───────────────────────────────────────
    if (type === 'purposes') {
      const periodMonths = period === 'year' ? 12 : period === 'week' ? 1 : 6;
      const useMonths    = months || periodMonths;
      const fromDate     = startOfMonth(subMonths(now, useMonths - 1)).toISOString();

      const requestsRes = await supabase
        .from('requests')
        .select('purpose:purposes(name), destination, start_datetime')
        .gte('created_at', fromDate)
        .in('status', ['dispatched','in_use','returned']);

      const requests = requestsRes.data || [];

      const purposeMap: Record<string, number> = {};
      requests.forEach((r: any) => {
        const name = r.purpose?.name || '미지정';
        purposeMap[name] = (purposeMap[name] || 0) + 1;
      });

      const destMap: Record<string, number> = {};
      requests.forEach((r: any) => {
        const dest = r.destination?.trim();
        if (dest) destMap[dest] = (destMap[dest] || 0) + 1;
      });

      const dayLabels = ['일','월','화','수','목','금','토'];
      const dayCount  = [0,0,0,0,0,0,0];
      requests.forEach((r: any) => {
        if (r.start_datetime) dayCount[new Date(r.start_datetime).getDay()]++;
      });

      const monthlyCount: Record<string, any> = {};
      for (let i = useMonths - 1; i >= 0; i--) {
        const d = subMonths(now, i);
        monthlyCount[format(d, 'yyyy-MM')] = { month: format(d, 'M월'), count: 0 };
      }
      requests.forEach((r: any) => {
        const key = r.start_datetime?.slice(0, 7);
        if (monthlyCount[key]) monthlyCount[key].count++;
      });

      return Response.json({
        data: {
          purposes:     Object.entries(purposeMap).sort((a,b) => b[1]-a[1]).map(([name,count]) => ({ name, count })),
          destinations: Object.entries(destMap).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name,count]) => ({ name, count })),
          by_day:       dayLabels.map((label, i) => ({ label, count: dayCount[i] })),
          monthly:      Object.values(monthlyCount),
        },
        error: null,
      });
    }

    return Response.json({ data: null, error: '알 수 없는 type 파라미터입니다' }, { status: 400 });
  } catch (e: any) {
    return createErrorResponse(e?.message || '서버 오류가 발생했습니다');
  }
}
