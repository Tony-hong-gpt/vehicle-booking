import { z } from 'zod';

// 로그인 (이메일 또는 전화번호)
export const loginSchema = z.object({
  email: z.string().min(1, '이메일 또는 전화번호를 입력해주세요'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다'),
});

// 비밀번호 강도: 영문/숫자/특수문자 중 2종류 이상 조합, 6자 이상
const passwordSchema = z.string()
  .min(6, '비밀번호는 최소 6자 이상이어야 합니다')
  .refine(pw => {
    const hasLetter  = /[a-zA-Z]/.test(pw);
    const hasNumber  = /[0-9]/.test(pw);
    const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
    return [hasLetter, hasNumber, hasSpecial].filter(Boolean).length >= 2;
  }, '영문, 숫자, 특수문자 중 2종류 이상을 조합해주세요');

// 신청자 자가 가입
export const signupSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요'),
  phone: z.string().min(9, '전화번호를 입력해주세요').max(20),
  password: passwordSchema,
  department_id: z.string().optional().transform(v => v || undefined),
});

// 사용자
export const createUserSchema = z.object({
  employee_no: z.string().min(1, '사번을 입력해주세요'),
  name: z.string().min(1, '이름을 입력해주세요'),
  email: z.string().email('유효한 이메일을 입력해주세요'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다'),
  phone: z.string().optional(),
  department_id: z.string().min(1, '유효한 부서를 선택해주세요').optional(),
  role: z.enum(['admin', 'manager', 'employee', 'driver', 'committee_secretary', 'committee_vice', 'committee_chair']),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, '이름을 입력해주세요').optional(),
  phone: z.string().optional(),
  department_id: z.string().min(1).optional().nullable(),
  role: z.enum(['admin', 'manager', 'employee', 'driver', 'committee_secretary', 'committee_vice', 'committee_chair']).optional(),
  is_active: z.boolean().optional(),
});

// 차량
export const createVehicleSchema = z.object({
  vehicle_group_id: z.string().min(1, '차량군을 선택해주세요'),
  name: z.string().min(1, '차량명을 입력해주세요'),
  license_plate: z.string().min(1, '차량번호를 입력해주세요'),
  model: z.string().optional(),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  fuel_type: z.enum(['gasoline', 'diesel', 'electric', 'hybrid']),
  current_mileage: z.number().int().min(0).default(0),
});

export const updateVehicleSchema = z.object({
  vehicle_group_id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  license_plate: z.string().min(1).optional(),
  model: z.string().optional(),
  year: z.number().int().min(1990).optional(),
  capacity: z.number().int().min(1).optional(),
  status: z.enum(['available', 'in_use', 'maintenance', 'inactive']).optional(),
  fuel_type: z.enum(['gasoline', 'diesel', 'electric', 'hybrid']).optional(),
  current_mileage: z.number().int().min(0).optional(),
});

// 신청
export const createRequestSchema = z.object({
  purpose_id: z.string().min(1, '사용목적을 선택해주세요').optional().nullable(),
  custom_purpose: z.string().max(20, '사용목적은 최대 20자까지 입력 가능합니다').optional().nullable(),
  vehicle_group_id: z.string().min(1, '차량군을 선택해주세요'),
  preferred_vehicle_id: z.string().min(1).optional().nullable(),
  destination: z.string().min(1, '목적지를 입력해주세요'),
  passengers: z.number().int().min(1, '탑승 인원은 1명 이상이어야 합니다').max(50),
  start_datetime: z.string().datetime('유효한 출발 일시를 입력해주세요'),
  end_datetime: z.string().datetime('유효한 반납 일시를 입력해주세요'),
  reason: z.string().optional(),
  driver_name: z.string().max(30).optional().nullable(),
  driver_phone: z.string().max(20).optional().nullable(),
}).refine(data => data.purpose_id || (data.custom_purpose && data.custom_purpose.trim()), {
  message: '사용목적을 선택하거나 직접 입력해주세요',
}).refine(data => new Date(data.end_datetime) > new Date(data.start_datetime), {
  message: '반납 일시는 출발 일시보다 이후여야 합니다',
  path: ['end_datetime'],
});

export const updateRequestSchema = z.object({
  purpose_id: z.string().min(1).optional().nullable(),
  custom_purpose: z.string().max(20).optional().nullable(),
  vehicle_group_id: z.string().min(1).optional(),
  department_id: z.string().min(1).optional(),
  destination: z.string().min(1).optional(),
  passengers: z.number().int().min(1).optional(),
  start_datetime: z.string().datetime().optional(),
  end_datetime: z.string().datetime().optional(),
  reason: z.string().optional(),
  driver_name: z.string().max(30).optional().nullable(),
  driver_phone: z.string().max(20).optional().nullable(),
  status: z.enum([
    'pending','upper_approved','committee_reviewing','committee_vice_reviewing',
    'on_hold','approved','rejected','dispatched','in_use','returned','cancelled',
  ]).optional(),
});

// 결재
export const approveRequestSchema = z.object({
  comment: z.string().optional(),
});

export const rejectRequestSchema = z.object({
  comment: z.string().min(1, '반려 사유를 입력해주세요'),
});

// 배차
export const createDispatchSchema = z.object({
  request_id: z.string().min(1, '신청 ID를 입력해주세요'),
  vehicle_id: z.string().min(1).optional().nullable(),
  driver_id: z.string().min(1).optional().nullable(),
  driver_name: z.string().max(30).optional().nullable(),
  driver_phone: z.string().max(20).optional().nullable(),
  scheduled_start: z.string().optional().nullable(),
  scheduled_end: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  is_rental: z.boolean().optional().default(false),
});

export const updateDispatchSchema = z.object({
  vehicle_id: z.string().min(1).optional().nullable(),
  driver_id: z.string().min(1).optional().nullable(),
  driver_name: z.string().max(30).optional().nullable(),
  driver_phone: z.string().max(20).optional().nullable(),
  scheduled_start: z.string().datetime().optional(),
  scheduled_end: z.string().datetime().optional(),
  actual_start: z.string().datetime().optional().nullable(),
  actual_end: z.string().datetime().optional().nullable(),
  notes: z.string().optional(),
  is_rental: z.boolean().optional(),
});

export const completeDispatchSchema = z.object({
  end_mileage: z.number().int().min(0, '주행 거리를 입력해주세요'),
  fuel_level: z.enum(['empty', 'quarter', 'half', 'three_quarter', 'full']),
  condition: z.string().optional(),
  notes: z.string().optional(),
});

// 주행일지
export const createMileageLogSchema = z.object({
  dispatch_id: z.string().min(1),
  vehicle_id: z.string().min(1),
  driver_id: z.string().min(1).optional().nullable(),
  start_mileage: z.number().int().min(0),
  end_mileage: z.number().int().min(0).optional().nullable(),
  log_date: z.string().date(),
  route: z.string().optional(),
  notes: z.string().optional(),
});

export const updateMileageLogSchema = z.object({
  end_mileage: z.number().int().min(0).optional(),
  route: z.string().optional(),
  notes: z.string().optional(),
});

// 페이지네이션
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(10),
  search: z.string().optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type ApproveRequestInput = z.infer<typeof approveRequestSchema>;
export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;
export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type UpdateDispatchInput = z.infer<typeof updateDispatchSchema>;
export type CompleteDispatchInput = z.infer<typeof completeDispatchSchema>;
export type CreateMileageLogInput = z.infer<typeof createMileageLogSchema>;
export type UpdateMileageLogInput = z.infer<typeof updateMileageLogSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
