import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const supabase = await createClient();
    const { data: req } = await supabase.from('requests').select('requester_id, status').eq('id', id).single();
    if (!req) return createErrorResponse('신청을 찾을 수 없습니다', 404);

    if (req.requester_id !== user.id && user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    // approved·dispatched 상태도 취소 가능 (배차 후 취소 포함)
    const cancellableStatuses = [
      'pending', 'upper_approved', 'committee_reviewing', 'committee_vice_reviewing',
      'on_hold', 'approved', 'dispatched',
    ];
    if (!cancellableStatuses.includes(req.status)) {
      return Response.json({ data: null, error: '취소할 수 없는 상태입니다' }, { status: 400 });
    }

    // 신청 취소
    const { data, error } = await supabase
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();
    if (error) return createErrorResponse(error.message);

    // 배차 완료 상태였다면 → 연결된 배차도 취소 + 차량 복원
    if (req.status === 'dispatched') {
      const adminSupabase = createAdminClient();
      const { data: dispatch } = await adminSupabase
        .from('dispatches')
        .select('id, vehicle_id, is_rental, status')
        .eq('request_id', id)
        .in('status', ['scheduled', 'in_progress'])
        .maybeSingle();

      if (dispatch) {
        await adminSupabase.from('dispatches').update({ status: 'cancelled' }).eq('id', dispatch.id);
        if (dispatch.vehicle_id && !dispatch.is_rental) {
          await adminSupabase.from('vehicles').update({ status: 'available' }).eq('id', dispatch.vehicle_id);
        }
      }
    }

    return Response.json({ data, error: null, message: '취소되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
