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
      const [vehiclesRes, reqCurrRes, reqPrevRes, dispCurrRes, dispPrevRes, deptReqRes, purposeReqRes, step5AppRes] = await Promise.all([
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
        // 처리 소요시간 계산용 (최종 승인 step=5)
        supabase.from('approvals')
          .select('request_id, approved_at')
          .eq('step', 5)
          .eq('status', 'approved')
          .gte('approved_at', fromISO)
          .lte('approved_at', toISO),
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
      const approvedReqs  = reqCurr.filter(r => ['approved','dispatched','in_use','returned'].includes(r.status)).length;
      const rejectedReqs  = reqCurr.filter(r => r.status === 'rejected').length;
      const cancelledReqs = reqCurr.filter(r => r.status === 'cancelled').length;
      const pendingReqs   = reqCurr.filter(r => ['pending','upper_approved','committee_reviewing','committee_vice_reviewing'].includes(r.status)).length;
      const decidedReqs   = totalReqs - pendingReqs;
      const approvalRate  = decidedReqs > 0 ? Math.round((approvedReqs / decidedReqs) * 100) : 0;

      // 이전 기간 비교용
      const prevApprovedReqs  = reqPrev.filter(r => ['approved','dispatched','in_use','returned'].includes(r.status)).length;
      const prevRejectedReqs  = reqPrev.filter(r => r.status === 'rejected').length;
      const prevDispTotal     = dispPrev.length;

      // 처리 소요시간 (신청 생성 → 최종 승인)
      const step5Data = step5AppRes.data || [];
      const step5ReqIds = [...new Set(step5Data.map((a: any) => a.request_id).filter(Boolean))];
      let step5ReqCreatedMap: Record<string, string> = {};
      if (step5ReqIds.length > 0) {
        const { data: step5Reqs } = await supabase.from('requests').select('id, created_at').in('id', step5ReqIds);
        step5ReqCreatedMap = Object.fromEntries((step5Reqs || []).map((r: any) => [r.id, r.created_at]));
      }
      const processTimes = step5Data.map((a: any) => {
        const created = step5ReqCreatedMap[a.request_id];
        if (!created || !a.approved_at) return null;
        const h = (new Date(a.approved_at).getTime() - new Date(created).getTime()) / 3600000;
        return h >= 0 ? h : null;
      }).filter((t): t is number => t !== null);
      const avgProcessHours = processTimes.length > 0
        ? Math.round(processTimes.reduce((s, t) => s + t, 0) / processTimes.length * 10) / 10
        : null;
      const fastCount = processTimes.filter(t => t < 24).length;
      const midCount  = processTimes.filter(t => t >= 24 && t < 72).length;
      const slowCount = processTimes.filter(t => t >= 72).length;

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

      // 차량 현재 상태 분류
      const availableVehicles   = vehicles.filter((v: any) => v.status === 'available').length;
      const maintenanceVehicles = vehicles.filter((v: any) => v.status === 'maintenance').length;
      const inUseVehicles       = vehicles.filter((v: any) => ['in_use', 'booked', 'dispatched'].includes(v.status)).length;

      return Response.json({
        data: {
          kpi: {
            total_requests:   { value: totalReqs,       diff: diff(totalReqs, prevTotalReqs) },
            approval_rate:    { value: approvalRate,     unit: '%' },
            completed_trips:  { value: completedDisp,   diff: diff(completedDisp, prevCompletedDisp) },
            utilization_rate: { value: utilizationRate,  unit: '%' },
          },
          requests:   {
            total: totalReqs, approved: approvedReqs, rejected: rejectedReqs,
            cancelled: cancelledReqs, pending: pendingReqs,
            diffs: {
              total:    diff(totalReqs, prevTotalReqs),
              approved: diff(approvedReqs, prevApprovedReqs),
              rejected: diff(rejectedReqs, prevRejectedReqs),
            },
          },
          dispatches: {
            total: totalDisp, completed: completedDisp, scheduled: scheduledDisp,
            diffs: { total: diff(totalDisp, prevDispTotal) },
          },
          avg_process_hours: avgProcessHours,
          process_distribution: { fast: fastCount, mid: midCount, slow: slowCount },
          vehicles:   { total: activeVehicles, used: usedVehicleIds.size, unused: activeVehicles - usedVehicleIds.size, available: availableVehicles, maintenance: maintenanceVehicles, in_use: inUseVehicles },
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
        .lte('created_at', toISO);

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

    // ── 6. 차량군별 배차 현황 ──────────────────────────────────────────
    if (type === 'vehicle_groups') {
      const dispRes = await supabase
        .from('dispatches')
        .select('vehicle_id')
        .gte('scheduled_start', fromISO)
        .lte('scheduled_start', toISO)
        .neq('status', 'cancelled');

      const vehicleIds = [...new Set((dispRes.data || []).map((d: any) => d.vehicle_id).filter(Boolean))];
      let vehGroupMap: Record<string, string> = {};
      if (vehicleIds.length > 0) {
        const { data: vehs } = await supabase
          .from('vehicles')
          .select('id, vehicle_group:vehicle_groups!vehicle_group_id(name)')
          .in('id', vehicleIds);
        (vehs || []).forEach((v: any) => {
          vehGroupMap[v.id] = (v.vehicle_group as any)?.name || '미분류';
        });
      }

      const groupCounts: Record<string, number> = {};
      (dispRes.data || []).forEach((d: any) => {
        const gName = vehGroupMap[d.vehicle_id] || '미분류';
        groupCounts[gName] = (groupCounts[gName] || 0) + 1;
      });
      const total = Object.values(groupCounts).reduce((s, c) => s + c, 0);
      const groups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({
          name, count,
          percent: total > 0 ? Math.round((count / total) * 100) : 0,
        }));

      return Response.json({ data: { groups, total }, error: null });
    }

    // ── 7. 담당자별 처리 현황 ─────────────────────────────────────────
    if (type === 'processors') {
      const appRes = await supabase
        .from('approvals')
        .select('request_id, step, approver_id, status, approved_at, approver:users!approver_id(name, role)')
        .gte('approved_at', fromISO)
        .lte('approved_at', toISO)
        .in('step', [3, 4, 5]);

      const approvals = appRes.data || [];
      const reqIds = [...new Set(approvals.map((a: any) => a.request_id).filter(Boolean))];
      let reqCreatedMap: Record<string, string> = {};
      if (reqIds.length > 0) {
        const { data: reqs } = await supabase
          .from('requests').select('id, created_at').in('id', reqIds);
        reqCreatedMap = Object.fromEntries((reqs || []).map((r: any) => [r.id, r.created_at]));
      }

      const personMap: Record<string, { name: string; role: string; step: number; count: number; totalHours: number; timeCount: number }> = {};
      approvals.forEach((a: any) => {
        const pid = a.approver_id;
        if (!pid) return;
        if (!personMap[pid]) {
          personMap[pid] = {
            name: (a.approver as any)?.name || '알 수 없음',
            role: (a.approver as any)?.role || '',
            step: a.step,
            count: 0, totalHours: 0, timeCount: 0,
          };
        }
        personMap[pid].count++;
        const created = reqCreatedMap[a.request_id];
        if (created && a.approved_at) {
          const h = (new Date(a.approved_at).getTime() - new Date(created).getTime()) / 3600000;
          if (h >= 0) { personMap[pid].totalHours += h; personMap[pid].timeCount++; }
        }
      });

      const processors = Object.entries(personMap).map(([id, p]) => ({
        id, name: p.name, role: p.role, step: p.step,
        count: p.count,
        avg_hours: p.timeCount > 0 ? Math.round(p.totalHours / p.timeCount * 10) / 10 : null,
      })).sort((a, b) => a.step - b.step || b.count - a.count);

      return Response.json({ data: { processors, total: approvals.length }, error: null });
    }

    return Response.json({ data: null, error: '알 수 없는 type 파라미터입니다' }, { status: 400 });
  } catch (e: any) {
    return createErrorResponse(e?.message || '서버 오류가 발생했습니다');
  }
}
