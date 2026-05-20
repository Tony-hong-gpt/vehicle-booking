export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
  DRIVER: 'driver',
  COMMITTEE_SECRETARY: 'committee_secretary',
  COMMITTEE_VICE: 'committee_vice',
  COMMITTEE_CHAIR: 'committee_chair',
} as const;

export const REQUEST_STATUS = {
  PENDING: 'pending',
  UPPER_APPROVED: 'upper_approved',
  COMMITTEE_REVIEWING: 'committee_reviewing',
  COMMITTEE_VICE_REVIEWING: 'committee_vice_reviewing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  DISPATCHED: 'dispatched',
  IN_USE: 'in_use',
  RETURNED: 'returned',
  ON_HOLD: 'on_hold',
} as const;

export const VEHICLE_STATUS = {
  AVAILABLE: 'available',
  IN_USE: 'in_use',
  MAINTENANCE: 'maintenance',
  INACTIVE: 'inactive',
} as const;

export const DISPATCH_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const FUEL_TYPES = {
  GASOLINE: 'gasoline',
  DIESEL: 'diesel',
  ELECTRIC: 'electric',
  HYBRID: 'hybrid',
} as const;

export const FUEL_LEVELS = {
  EMPTY: 'empty',
  QUARTER: 'quarter',
  HALF: 'half',
  THREE_QUARTER: 'three_quarter',
  FULL: 'full',
} as const;

export const MAINTENANCE_TYPES = {
  INSPECTION: 'inspection',
  REPAIR: 'repair',
  WASH: 'wash',
  TIRE: 'tire',
  OIL: 'oil',
  OTHER: 'other',
} as const;

export const USER_ROLE_LABELS: Record<string, string> = {
  admin: '시스템관리자',
  manager: '부서관리자',
  employee: '일반직원',
  driver: '운전기사',
  committee_secretary: '차량위원회 총무',
  committee_vice: '차량위원회 부위원장',
  committee_chair: '차량위원회 위원장',
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: '상위승인대기',
  upper_approved: '차량위원회대기',
  committee_reviewing: '총무검토중',
  committee_vice_reviewing: '부위원장검토중',
  on_hold: '대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소',
  dispatched: '배차완료',
  in_use: '운행중',
  returned: '반납완료',
};

export const VEHICLE_STATUS_LABELS: Record<string, string> = {
  available: '사용가능',
  in_use: '운행중',
  maintenance: '정비중',
  inactive: '비활성',
};

export const DISPATCH_STATUS_LABELS: Record<string, string> = {
  scheduled: '배차완료',
  in_progress: '운행중',
  completed: '반납완료',
  cancelled: '취소',
};

export const FUEL_TYPE_LABELS: Record<string, string> = {
  gasoline: '휘발유',
  diesel: '경유',
  electric: '전기',
  hybrid: '하이브리드',
};

export const FUEL_LEVEL_LABELS: Record<string, string> = {
  empty: '없음(E)',
  quarter: '1/4',
  half: '1/2',
  three_quarter: '3/4',
  full: '가득(F)',
};

export const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  inspection: '정기점검',
  repair: '수리',
  wash: '세차',
  tire: '타이어',
  oil: '오일교환',
  other: '기타',
};

export const REQUEST_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  upper_approved: 'bg-indigo-100 text-indigo-800',
  committee_reviewing: 'bg-violet-100 text-violet-800',
  committee_vice_reviewing: 'bg-fuchsia-100 text-fuchsia-800',
  on_hold: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  dispatched: 'bg-blue-100 text-blue-800',
  in_use: 'bg-purple-100 text-purple-800',
  returned: 'bg-slate-100 text-slate-800',
};

export const VEHICLE_STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  in_use: 'bg-blue-100 text-blue-800',
  maintenance: 'bg-orange-100 text-orange-800',
  inactive: 'bg-gray-100 text-gray-800',
};

export const PAGE_SIZE = 10;
