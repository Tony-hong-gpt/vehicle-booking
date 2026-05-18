import { createClient, createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { updateRequestSchema } from '@/lib/validators';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('requests')
      .select(`
        *,
        requester:users!requester_id(id, name, employee_no, email, phone, department:departments(name)),
        department:departments(id, name),
        purpose:purposes(id, name),
        vehicle_group:vehicle_groups(id, name),
        preferred_vehicle:vehicles(id, name, license_plate),
        approvals(*, approver:users!approver_id(id, name, role, department:departments(name))),
        dispatch:dispatches(*, vehicle:vehicles(id, name, license_plate), driver:drivers(id, user:users(name, phone)))
      `)
      .eq('id', id)
      .single();

    if (error) return createErrorResponse('신청을 찾을 수 없습니다', 404);

    // approvals는 RLS에 막힐 수 있으므로 admin client로 별도 조회해서 병합
    const adminSupabase = await createAdminClient();
    const { data: approvals } = await adminSupabase
      .from('approvals')
      .select('*, approver:users!approver_id(id, name, role, department:departments(name))')
      .eq('request_id', id)
      .order('step', { ascending: true });

    return Response.json({ data: { ...data, approvals: approvals ?? [] }, error: null });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const body = await request.json();
    const parsed = updateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();

    // admin 변경 감지를 위해 현재 값 + 관련 이름 함께 조회
    const { data: existing } = await supabase
      .from('requests')
      .select(`
        requester_id, status,
        vehicle_group_id, vehicle_group:vehicle_groups(name),
        destination, start_datetime, end_datetime,
        purpose_id, purpose:purposes(name),
        custom_purpose, passengers
      `)
      .eq('id', id)
      .single();

    if (!existing) return createErrorResponse('신청을 찾을 수 없습니다', 404);
    if (existing.requester_id !== user.id && user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    // 일반 신청자: pending/rejected/on_hold 상태만 수정 가능
    if (user.role !== 'admin' && !['pending', 'rejected', 'on_hold'].includes(existing.status)) {
      return Response.json({ data: null, error: '현재 상태에서는 수정할 수 없습니다' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = { ...parsed.data };

    // 일반 신청자가 반려/대기 상태 수정 시 → 다시 pending으로
    if (user.role !== 'admin' && ['rejected', 'on_hold'].includes(existing.status)) {
      updatePayload.status = 'pending';
    }

    const { data, error } = await supabase.from('requests').update(updatePayload).eq('id', id).select().single();
    if (error) return createErrorResponse(error.message);

    // admin이 status를 직접 변경한 경우 → approval 기록 자동 생성/업데이트
    const newStatus = updatePayload.status as string | undefined;
    if (user.role === 'admin' && newStatus && newStatus !== existing.status) {
      const { createAdminClient } = await import('@/lib/server/supabase');
      const adminSupabase = await createAdminClient();

      // ── 변경된 필드 자동 감지 ──
      const changes: string[] = [];

      // 차량군 변경
      if (parsed.data.vehicle_group_id && parsed.data.vehicle_group_id !== existing.vehicle_group_id) {
        const { data: newGroup } = await supabase
          .from('vehicle_groups').select('name').eq('id', parsed.data.vehicle_group_id).single();
        const oldName = (existing as any).vehicle_group?.name || '(없음)';
        const newName = newGroup?.name || '(없음)';
        changes.push(`차량군을 ${oldName}에서 ${newName}으로 변경하였습니다`);
      }
      // 목적지 변경
      if (parsed.data.destination && parsed.data.destination !== existing.destination) {
        changes.push(`목적지를 "${existing.destination}"에서 "${parsed.data.destination}"으로 변경하였습니다`);
      }
      // 출발일시 변경 (타임존 포맷 차이를 무시하고 실제 시각으로 비교)
      if (parsed.data.start_datetime && existing.start_datetime) {
        const newMs = new Date(parsed.data.start_datetime).getTime();
        const oldMs = new Date(existing.start_datetime).getTime();
        if (newMs !== oldMs) changes.push(`출발 일시를 변경하였습니다`);
      }
      // 반납일시 변경
      if (parsed.data.end_datetime && existing.end_datetime) {
        const newMs = new Date(parsed.data.end_datetime).getTime();
        const oldMs = new Date(existing.end_datetime).getTime();
        if (newMs !== oldMs) changes.push(`반납 일시를 변경하였습니다`);
      }
      // 탑승 인원 변경
      if (parsed.data.passengers !== undefined && parsed.data.passengers !== existing.passengers) {
        changes.push(`탑승 인원을 ${existing.passengers}명에서 ${parsed.data.passengers}명으로 변경하였습니다`);
      }

      // 최종 코멘트 조합:
      // 형식: "[관리자 메모]\n[CHANGES]\n변경내용1\n변경내용2"
      const adminNote = body.admin_note?.trim() || '';
      const changesBlock = changes.length > 0 ? `[CHANGES]\n${changes.join('\n')}` : '';
      const finalComment = [adminNote, changesBlock].filter(Boolean).join('\n') ||
        '관리자 직접 처리';

      const approvalStatus =
        newStatus === 'approved'       ? 'approved' :
        newStatus === 'rejected'       ? 'rejected' :
        newStatus === 'on_hold'        ? 'on_hold'  :
        newStatus === 'upper_approved' ? 'approved' : null;

      if (approvalStatus) {
        // 기존 approval 중 가장 높은 step 번호 조회
        const { data: stepRows } = await adminSupabase
          .from('approvals')
          .select('step')
          .eq('request_id', id)
          .order('step', { ascending: false })
          .limit(1);

        const maxStep = stepRows?.[0]?.step ?? 0;
        // 관리자 직접 수정은 항상 새 레코드 INSERT (히스토리 보존)
        // upper_approved 제외 모든 admin 직접 처리는 step >= 2
        const step = Math.max(maxStep + 1, 2);

        const approvalPayload = {
          approver_id: user.id,
          status: approvalStatus,
          comment: finalComment,
          approved_at: new Date().toISOString(),
        };

        await adminSupabase.from('approvals').insert({ request_id: id, step, ...approvalPayload });
      }
    }

    return Response.json({ data, error: null, message: '수정되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { id } = await params;
    const supabase = await createClient();
    const { data: existing } = await supabase.from('requests').select('requester_id, status').eq('id', id).single();
    if (!existing) return createErrorResponse('신청을 찾을 수 없습니다', 404);
    if (existing.requester_id !== user.id && user.role !== 'admin') {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }
    if (existing.status !== 'cancelled') {
      return Response.json({ data: null, error: '취소된 신청만 삭제할 수 있습니다' }, { status: 400 });
    }

    // 연결된 결재 기록 삭제 후 신청 삭제
    await supabase.from('approvals').delete().eq('request_id', id);
    const { error } = await supabase.from('requests').delete().eq('id', id);
    if (error) return createErrorResponse(error.message);
    return Response.json({ data: null, error: null, message: '신청이 삭제되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
