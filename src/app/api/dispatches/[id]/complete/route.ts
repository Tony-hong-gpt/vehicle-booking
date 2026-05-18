import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { completeDispatchSchema } from '@/lib/validators';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const body = await request.json();
    const parsed = completeDispatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: dispatch } = await supabase
      .from('dispatches')
      .select('status, vehicle_id, request_id, vehicle:vehicles(current_mileage)')
      .eq('id', id)
      .single();

    if (!dispatch) return createErrorResponse('배차를 찾을 수 없습니다', 404);
    if (!['scheduled', 'in_progress'].includes(dispatch.status)) {
      return Response.json({ data: null, error: '완료할 수 없는 상태입니다' }, { status: 400 });
    }

    const now = new Date().toISOString();

    await supabase.from('returns').insert({
      dispatch_id: id,
      returned_by: user.id,
      return_datetime: now,
      end_mileage: parsed.data.end_mileage,
      fuel_level: parsed.data.fuel_level,
      condition: parsed.data.condition || null,
      notes: parsed.data.notes || null,
    });

    await supabase.from('dispatches').update({ status: 'completed', actual_end: now }).eq('id', id);
    await supabase.from('vehicles').update({ status: 'available', current_mileage: parsed.data.end_mileage }).eq('id', dispatch.vehicle_id);
    await supabase.from('requests').update({ status: 'returned' }).eq('id', dispatch.request_id);

    // ── 주행거리 기록 ──
    // 출발 시 생성된 mileage_log가 있으면 end_mileage 업데이트, 없으면 신규 생성
    if (dispatch.vehicle_id) {
      const { data: existingLog } = await supabase
        .from('mileage_logs')
        .select('id, start_mileage')
        .eq('dispatch_id', id)
        .maybeSingle();

      if (existingLog) {
        await supabase
          .from('mileage_logs')
          .update({ end_mileage: parsed.data.end_mileage })
          .eq('id', existingLog.id);
      } else {
        // 출발 주행거리 미입력 시 → 반납 시점 차량 기존 주행거리를 start로 사용
        const prevMileage = (dispatch.vehicle as any)?.current_mileage ?? 0;
        await supabase.from('mileage_logs').insert({
          dispatch_id: id,
          vehicle_id: dispatch.vehicle_id,
          start_mileage: prevMileage,
          end_mileage: parsed.data.end_mileage,
          log_date: now.split('T')[0],
        });
      }
    }

    return Response.json({ data: null, error: null, message: '반납이 완료되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
