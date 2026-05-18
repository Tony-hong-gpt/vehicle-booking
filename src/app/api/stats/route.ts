import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const type   = searchParams.get('type')   || 'overview';
    const months = parseInt(searchParams.get('months') || '6');

    const supabase = createAdminClient();
    const now = new Date();

    // ── 1. 개요 ──────────────────────────────────────────────────────
    if (type === 'overview') {
      const [vehiclesRes, requestsRes, dispatchesRes] = await Promise.all([
        supabase.from('vehicles').select('id, status'),
        supabase.from('requests').select('id, status, created_at'),
        supabase.from('dispatches').select('id, status'),
      ]);

      const vehicles   = vehiclesRes.data   || [];
      const requests   = requestsRes.data   || [];
      const dispatches = dispatchesRes.data || [];
      const thisMonthStart = startOfMonth(now).toISOString();

      return Response.json({
        data: {
          vehicles: {
            total:       vehicles.length,
            available:   vehicles.filter(v => v.status === 'available').length,
            in_use:      vehicles.filter(v => v.status === 'in_use').length,
            maintenance: vehicles.filter(v => v.status === 'maintenance').length,
            inactive:    vehicles.filter(v => v.status === 'inactive').length,
          },
          requests: {
            total:      requests.length,
            this_month: requests.filter(r => r.created_at >= thisMonthStart).length,
            approved:   requests.filter(r => ['dispatched','in_use','returned'].includes(r.status)).length,
            pending:    requests.filter(r => ['pending','upper_approved','approved'].includes(r.status)).length,
            cancelled:  requests.filter(r => r.status === 'cancelled').length,
          },
          dispatches: {
            total:       dispatches.length,
            scheduled:   dispatches.filter(d => d.status === 'scheduled').length,
            in_progress: dispatches.filter(d => d.status === 'in_progress').length,
            completed:   dispatches.filter(d => d.status === 'completed').length,
          },
        },
        error: null,
      });
    }

    // ── 2. 월별 신청/배차 현황 ────────────────────────────────────────
    if (type === 'monthly') {
      const fromDate = startOfMonth(subMonths(now, months - 1)).toISOString();
      const [requestsRes, dispatchesRes] = await Promise.all([
        supabase.from('requests').select('status, created_at').gte('created_at', fromDate),
        supabase.from('dispatches').select('status, scheduled_start').gte('scheduled_start', fromDate),
      ]);

      const requests   = requestsRes.data   || [];
      const dispatches = dispatchesRes.data || [];

      const monthly: Record<string, any> = {};
      for (let i = months - 1; i >= 0; i--) {
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
      const fromDate = startOfMonth(subMonths(now, months - 1)).toISOString();
      const toDate   = endOfMonth(now).toISOString();

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

      // 차량별 운행 건수
      const usageMap: Record<string, number> = {};
      dispatches.forEach((d: any) => {
        if (d.vehicle_id) usageMap[d.vehicle_id] = (usageMap[d.vehicle_id] || 0) + 1;
      });

      // 월별 가동률 (운행한 차량 수 / 전체 차량 수)
      const monthlyUtil: Record<string, any> = {};
      for (let i = months - 1; i >= 0; i--) {
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

      // 차량별 운행 건수 (많은 순)
      const vehicleUsage = vehicles
        .map((v: any) => ({
          id:            v.id,
          name:          [v.name, v.model].filter(Boolean).join(' '),
          license_plate: v.license_plate,
          group:         v.vehicle_group?.name || '-',
          count:         usageMap[v.id] || 0,
        }))
        .sort((a: any, b: any) => b.count - a.count);

      return Response.json({
        data: { monthly: Object.values(monthlyUtil), vehicles: vehicleUsage },
        error: null,
      });
    }

    // ── 4. 부서별 사용 현황 ───────────────────────────────────────────
    if (type === 'departments') {
      const fromDate = startOfMonth(subMonths(now, months - 1)).toISOString();

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

      const topDepts = Object.entries(deptMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name]) => name);

      const monthlyDept: Record<string, any> = {};
      for (let i = months - 1; i >= 0; i--) {
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

      const deptRanking = Object.entries(deptMap)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      return Response.json({
        data: { ranking: deptRanking, monthly: Object.values(monthlyDept), top_depts: topDepts },
        error: null,
      });
    }

    // ── 5. 목적지/사용목적 분석 ───────────────────────────────────────
    if (type === 'purposes') {
      const fromDate = startOfMonth(subMonths(now, months - 1)).toISOString();

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
      for (let i = months - 1; i >= 0; i--) {
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
