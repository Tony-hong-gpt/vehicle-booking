import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { maintenance_type, description, cost, maintenance_date, next_maintenance_date, performed_by } = body;

    const VALID_TYPES = ['inspection', 'repair', 'wash', 'tire', 'oil', 'other'];
    if (maintenance_type && !VALID_TYPES.includes(maintenance_type)) {
      return Response.json({ data: null, error: '올바른 정비 유형이 아닙니다' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (maintenance_type  !== undefined) updateData.maintenance_type = maintenance_type;
    if (description       !== undefined) updateData.description = description || null;
    if (cost              !== undefined) updateData.cost = cost ? Number(cost) : null;
    if (maintenance_date  !== undefined) updateData.maintenance_date = maintenance_date;
    if (next_maintenance_date !== undefined) updateData.next_maintenance_date = next_maintenance_date || null;
    if (performed_by      !== undefined) updateData.performed_by = performed_by || null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('maintenances')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return createErrorResponse(error.message);
    return Response.json({ data, error: null, message: '수정되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (!['admin', 'manager'].includes(user.role)) {
      return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const supabase = await createClient();
    const { error } = await supabase.from('maintenances').delete().eq('id', id);
    if (error) return createErrorResponse(error.message);
    return Response.json({ data: null, error: null, message: '삭제되었습니다' });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
