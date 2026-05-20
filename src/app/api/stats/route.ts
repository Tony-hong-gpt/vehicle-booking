import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import {
  format, subDays,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  parseISO,
} from 'date-fns';
import { ko } from 'date-fns/locale';

function parseDateRange(searchParams: URLSearchParams, now: Date) {
  const fromParam = searchParams.get('from');
  const toParam   = searchParams.get('to');

  if (fromParam && toParam) {
    const from = parseISO(fromParam);
    const to   = new Date(parseISO(toParam).getTime() + 86399999); // end of day
    return { from, to };
  }

  // Default: current month
  return { from: startOfMonth(now), to: endOfMonth(now) };
}

function getPrevRange(from: Date, to: Date) {
  const duration = to.getTime() - from.getTime();
  const prevTo   = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - duration);
  return { prevFrom, prevTo };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const ALLOWED = ['admin', 'committee_secretary', 'committee_vice', 'committee_chair'];
    if (!user || !ALLOWED.includes(user.role)) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const type        = searchParams.get('type') || 'overview';
    const granularity = searchParams.get('granularity') || 'week'; // day | week | month
    const now         = new Date();

    const supabase = createAdminClient();
    const { from, to } = parseDateRange(searchParams, now);
    const { prevFrom, prevTo } = getPrevRange(from, to);

    const fromISO    = from.toISOString();
    const toISO      = to.toISOString();
    const prevFromISO = prevFrom.toISOString();
    const prevToISO   = prevTo.toISOString();

    // ── 1. 개요 ────────────────────────────────────────────────────────
    if (type === 'overview') {
      const [vehiclesRes, reqCurrRes, reqPrevRes, dispCurrRes, dispPrevRes, deptReqRes, purposeReqRes] = await Promise.all([
        supabase.from('vehicles').select('id, status'),
        supabase.from('requests').select('id, status, created_at').gte('created_at', fromISO).lte('created_at', toISO),
        supabase.from('requests').select('id, status').gte('created_at', prevFromISO).lte('created_at', prevToISO),
        supabase.from('dispatches').select('id, status, vehicle_id, scheduled_start').gte('scheduled_start', fromISO).lte('scheduled_start', toISO),
        supabase.from('dispatches').select('id, status').gte('scheduled_start', prevFromISO).lte('scheduled_start', prevToISO),
        // 부서 요약용
        supabase.from('requests')
          .select('department:departments(name)')
          .gte('created_at', fromISO).lte('created_at', toISO)
          .in('status', ['dispatched','in_use','returned']),
        // 사용목적 요약용
        supabase.from('requests')
          .select('purpose:purposes(name)')
          .gte('created_at', fromISO).lte('created_at', toISO)
          .in('status', ['dispatched','in_use','returned']),
      ]);

      const vehicles  = vehiclesRes.data  || [];
      const reqCurr   = reqCurrRes.data   || [];
      const reqPrev   = reqPrevRes.data   || [];
      const dispCurr  = dispCurrRes.data  || [];
      const dispPrev  = dispPrevRes.data  || [];
      const deptReqs  = deptReqRes.data   || [];
      const purposeReqs = purposeReqRes.data || [];

      // KPI
      const totalReqs     = reqCurr.length;
      const approvedReqs  = reqCurr.filter(r => ['dispatched','in_use','returned'].includes(r.status)).length;
      const cancelledReqs = reqCurr.filter(r => r.status === 'cancelled').length;
      const pendingReqs   = reqCurr.filter(r => ['pending','upper_approved','approved'].includes(r.status)).length;
      const decidedReqs   = totalReqs - pendingReqs;
      const approvalRate  = decidedReqs > 0 ? Math.round((approvedReqs / decidedReqs) * 100) : 0;

      const completedDisp  = dispCurr.filter((d: any) => d.status === 'completed').length;
      const scheduledDisp  = dispCurr.filter((d: any) => d.status === 'scheduled').length;
      const totalDisp      = dispCurr.length;
      const usedVehicleIds = new Set(dispCurr.map((d: any) => d.vehicle_id).filter(Boolean));
      const activeVehicles = vehicles.filter((v: any) => v.status !== 'inactive').length;
      const utilizationRate = activeVehicles > 0 ? Math.round((usedVehicleIds.size / activeVehicles) * 100) : 0;

      const prevTotalReqs     = reqPrev.length;
      const prevCompletedDisp = dispPrev.filter((d: any) => d.status === 'completed').length;
      const diff = (curr: number, prev: number) => prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

      // 시계열
      let timeSeries: any[] = [];
      if (granularity === 'day') {
        timeSeries = eachDayOfInterval({ start: from, end: to }).map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          return {
            label: format(day, 'EEE', { locale: ko }),
            requests:   reqCurr.filter(r => r.created_at?.startsWith(dayStr)).length,
            dispatches: dispCurr.filter((d: any) => d.scheduled_start?.startsWith(dayStr)).length,
          };
        });
      } else if (granularity === 'week') {
        const weeks = eachWeekOfInterval({ start: from, end: to }, { weekStartsOn: 1 });
        timeSeries = weeks.map((weekStart, i) => {
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
          const wFrom = weekStart.toISOString();
          const wTo   = weekEnd.toISOString();
          return {
            label: `${i + 1}주`,
            requests:   reqCurr.filter(r => r.created_at >= wFrom && r.created_at <= wTo).length,
            dispatches: dispCurr.filter((d: any) => d.scheduled_start >= wFrom && d.scheduled_start <= wTo).length,
          };
        });
      } else {
        timeSeries = eachMonthOfInterval({ start: from, end: to }).map(monthStart => {
          const mFrom = monthStart.toISOString();
          const mEnd  = endOfMonth(monthStart).toISOString();
          return {
            label: format(monthStart, 'M월'),
            requests:   reqCurr.filter(r => r.created_at >= mFrom && r.created_at <= mEnd).length,
            dispatches: dispCurr.filter((d: any) => d.scheduled_start >= mFrom && d.scheduled_start <= mEnd).length,
          };
        });
      }

      // 부서 요약 (상위 5)
      const deptMap: Record<string, number> = {};
      deptReqs.forEach((r: any) => {
        const name = r.department?.name || '미지정';
        deptMap[name] = (deptMap[name] || 0) + 1;
      });
      const topDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

      // 사용목적 요약 (상위 5)
      const purposeMap: Record<string, number> = {};
      purposeReqs.forEach((r: any) => {
        const name = r.purpose?.name || '미지정';
        purposeMap[name] = (purposeMap[name] || 0) + 1;
      });
      const topPurposes = Object.entries(purposeMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));

      return Response.json({
        data: {
          kpi: {
            total_requests:   { value: totalReqs,       diff: diff(totalReqs, prevTotalReqs) },
            approval_rate:    { value: approvalRate,     unit: '%' },
            completed_trips:  { value: completedDisp,   diff: diff(completedDisp, prevCompletedDisp) },
            utilization_rate: { value: utilizationRate,  unit: '%' },
          },
          requests:   { total: totalReqs, approved: approvedReqs, cancelled: cancelledReqs, pending: pendingReqs },
          dispatches: { total: totalDisp, completed: completedDisp, scheduled: scheduledDisp },
          vehicles:   { total: activeVehicles, used: usedVehicleIds.size, unused: activeVehicles - usedVehicleIds.size },
          time_series: timeSeries,
          top_depts:    topDepts,
          top_purposes: topPurposes,
        },
        error: null,
      });
    }

    // ── 2. 신청/배차 현황 ─────────────────────────────────────────────
    if (type === 'monthly') {
      const [requestsRes, dispatchesRes] = await Promise.all([
        supabase.from('requests').select('status, created_at').gte('created_at', fromISO).lte('created_at', toISO),
        supabase.from('dispatches').select('status, scheduled_start').gte('scheduled_start', fromISO).lte('scheduled_start', toISO),
      ]);

      const requests   = requestsRes.data   || [];
      const dispatches = dispatchesRes.data || [];

      // 월별 버킷
      const monthly: Record<string, any> = {};
      eachMonthOfInterval({ start: from, end: to }).forEach(monthStart => {
        const key = format(monthStart, 'yyyy-MM');
        monthly[key] = { month: format(monthStart, 'M월'), requests: 0, approved: 0, cancelled: 0, dispatches: 0 };
      });

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

      // 전체 집계
      const allReqs = {
        total:     requests.length,
        approved:  requests.filter((r: any) => ['dispatched','in_use','returned'].includes(r.status)).length,
        cancelled: requests.filter((r: any) => r.status === 'cancelled').length,
        pending:   requests.filter((r: any) => ['pending','upper_approved','approved'].includes(r.status)).length,
      };
      const allDisp = {
        total:     dispatches.length,
        completed: dispatches.filter((d: any) => d.status === 'completed').length,
        scheduled: dispatches.filter((d: any) => d.status === 'scheduled').length,
        in_progress: dispatches.filter((d: any) => d.status === 'in_progress').length,
      };

      return Response.json({ data: { monthly: Object.values(monthly), summary_req: allReqs, summary_disp: allDisp }, error: null });
    }

    // ── 3. 차량 가동률 ────────────────────────────────────────────────
    if (type === 'utilization') {
      const [vehiclesRes, dispatchesRes] = await Promise.all([
        supabase.from('vehicles')
          .select('id, name, model, license_plate, vehicle_group:vehicle_groups(name)')
          .neq('status', 'inactive'),
        supabase.from('dispatches')
          .select('vehicle_id, scheduled_start, status')
          .gte('scheduled_start', fromISO)
          .lte('scheduled_start', toISO)
          .neq('status', 'cancelled'),
      ]);

      const vehicles   = vehiclesRes.data   || [];
      const dispatches = dispatchesRes.data || [];

      const usageMap: Record<string, number> = {};
      dispatches.forEach((d: any) => {
        if (d.vehicle_id) usageMap[d.vehicle_id] = (usageMap[d.vehicle_id] || 0) + 1;
      });

      const monthlyUtil: Record<string, any> = {};
      eachMonthOfInterval({ start: from, end: to }).forEach(monthStart => {
        const key   = format(monthStart, 'yyyy-MM');
        const mFrom = monthStart.toISOString();
        const mEnd  = endOfMonth(monthStart).toISOString();
        const mDisp = dispatches.filter((d: any) => d.scheduled_start >= mFrom && d.scheduled_start <= mEnd);
        const used  = new Set(mDisp.map((d: any) => d.vehicle_id).filter(Boolean)).size;
        monthlyUtil[key] = {
          month: format(monthStart, 'M월'),
          used,
          total: vehicles.length,
          rate:  vehicles.length > 0 ? Math.round((used / vehicles.length) * 100) : 0,
        };
      });

      const vehicleUsage = vehicles
        .map((v: any) => ({
          id: v.id,
          name: [v.name, v.model].filter(Boolean).join(' '),
          license_plate: v.license_plate,
          group: (v.vehicle_group as any)?.name || '-',
          count: usageMap[v.id] || 0,
        }))
        .sort((a: any, b: any) => b.count - a.count);

      return Response.json({ data: { monthly: Object.values(monthlyUtil), vehicles: vehicleUsage }, error: null });
    }

    // ── 4. 부서별 사용 현황 ───────────────────────────────────────────
    if (type === 'departments') {
      const requestsRes = await supabase
        .from('requests')
        .select('department:departments(name), start_datetime, status')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
        .in('status', ['dispatched','in_use','returned']);

      const requests = requestsRes.data || [];

      const deptMap: Record<string, number> = {};
      requests.forEach((r: any) => {
        const name = r.department?.name || '미지정';
        deptMap[name] = (deptMap[name] || 0) + 1;
      });

      const topDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);

      const monthlyDept: Record<string, any> = {};
      eachMonthOfInterval({ start: from, end: to }).forEach(monthStart => {
        const key: string = format(monthStart, 'yyyy-MM');
        const row: Record<string, any> = { month: format(monthStart, 'M월') };
        topDepts.forEach(dept => { row[dept] = 0; });
        monthlyDept[key] = row;
      });

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
      const requestsRes = await supabase
        .from('requests')
        .select('purpose:purposes(name), destination, start_datetime')
        .gte('created_at', fromISO)
        .lte('created_at', toISO)
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
      eachMonthOfInterval({ start: from, end: to }).forEach(monthStart => {
        monthlyCount[format(monthStart, 'yyyy-MM')] = { month: format(monthStart, 'M월'), count: 0 };
      });
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
