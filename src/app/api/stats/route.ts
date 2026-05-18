import { createClient } from '@/lib/server/supabase';
import { getCurrentUser, createUnauthorizedResponse, createErrorResponse } from '@/lib/server/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();

    const supabase = await createClient();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: totalRequests },
      { count: pendingRequests },
      { count: approvedRequests },
      { count: activeDispatches },
      { count: availableVehicles },
      { count: totalVehicles },
      { count: monthlyRequests },
    ] = await Promise.all([
      supabase.from('requests').select('*', { count: 'exact', head: true }),
      supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('dispatches').select('*', { count: 'exact', head: true }).in('status', ['scheduled', 'in_progress']),
      supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      supabase.from('vehicles').select('*', { count: 'exact', head: true }).neq('status', 'inactive'),
      supabase.from('requests').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
    ]);

    return Response.json({
      data: {
        total_requests: totalRequests || 0,
        pending_requests: pendingRequests || 0,
        approved_requests: approvedRequests || 0,
        active_dispatches: activeDispatches || 0,
        available_vehicles: availableVehicles || 0,
        total_vehicles: totalVehicles || 0,
        monthly_requests: monthlyRequests || 0,
      },
      error: null,
    });
  } catch {
    return createErrorResponse('서버 오류가 발생했습니다');
  }
}
