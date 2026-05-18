import { createAdminClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';
import { createUserSchema, paginationSchema } from '@/lib/validators';
import { PAGE_SIZE } from '@/lib/constants';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get('page') || 1,
      page_size: searchParams.get('page_size') || PAGE_SIZE,
      search: searchParams.get('search') || undefined,
    });

    const adminSupabase = await createAdminClient();
    let query = adminSupabase
      .from('users')
      .select('id, name, email, phone, role, is_active, department_id, employee_no, created_at, department:departments(id, name)', { count: 'exact' });

    const role = searchParams.get('role');
    if (role) query = query.eq('role', role);

    const isActive = searchParams.get('is_active');
    if (isActive !== null) query = query.eq('is_active', isActive === 'true');

    if (pagination.search) {
      query = query.or(`name.ilike.%${pagination.search}%,email.ilike.%${pagination.search}%,employee_no.ilike.%${pagination.search}%`);
    }

    query = query.order('created_at', { ascending: false });
    const from = (pagination.page - 1) * pagination.page_size;
    query = query.range(from, from + pagination.page_size - 1);

    const { data, error, count } = await query;
    if (error) return createErrorResponse(error.message);

    return Response.json({
      data,
      total: count || 0,
      page: pagination.page,
      page_size: pagination.page_size,
      total_pages: Math.ceil((count || 0) / pagination.page_size),
      error: null,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    if (user.role !== 'admin') {
      return Response.json({ data: null, error: '관리자만 사용자를 등록할 수 있습니다' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ data: null, error: parsed.error.issues[0].message }, { status: 400 });
    }

    const adminSupabase = await createAdminClient();

    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
    });
    if (authError) return createErrorResponse(authError.message);

    const { data: profile, error: profileError } = await adminSupabase
      .from('users')
      .insert({
        id: authData.user.id,
        employee_no: parsed.data.employee_no,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        department_id: parsed.data.department_id || null,
        role: parsed.data.role,
      })
      .select('id, name, email, phone, role, is_active, department_id, employee_no')
      .single();

    if (profileError) {
      await adminSupabase.auth.admin.deleteUser(authData.user.id);
      return createErrorResponse(profileError.message);
    }

    return Response.json({ data: profile, error: null, message: '사용자가 등록되었습니다' }, { status: 201 });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
