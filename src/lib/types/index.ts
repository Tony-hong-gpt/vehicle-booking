export type UserRole =
  | 'admin'
  | 'manager'
  | 'employee'
  | 'driver'
  | 'committee_secretary'
  | 'committee_vice'
  | 'committee_chair';

export type RequestStatus =
  | 'pending'
  | 'upper_approved'
  | 'committee_reviewing'
  | 'committee_vice_reviewing'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'dispatched'
  | 'in_use'
  | 'returned'
  | 'on_hold';
export type VehicleStatus = 'available' | 'booked' | 'in_use' | 'maintenance' | 'inactive';
export type DispatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'on_hold';
export type FuelType = 'gasoline' | 'diesel' | 'electric' | 'hybrid';
export type FuelLevel = 'empty' | 'quarter' | 'half' | 'three_quarter' | 'full';
export type MaintenanceType = 'inspection' | 'repair' | 'wash' | 'tire' | 'oil' | 'other';

export interface Department {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

export interface User {
  id: string;
  department_id: string | null;
  employee_no: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface VehicleGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  vehicle_group_id: string;
  name: string;
  license_plate: string;
  model: string | null;
  year: number | null;
  capacity: number | null;
  status: VehicleStatus;
  fuel_type: FuelType;
  current_mileage: number;
  created_at: string;
  updated_at: string;
  vehicle_group?: VehicleGroup;
}

export interface Driver {
  id: string;
  user_id: string;
  license_type: string | null;
  license_no: string | null;
  license_expiry: string | null;
  is_available: boolean;
  created_at: string;
  user?: User;
}

export interface Purpose {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalConfig {
  id: string;
  department_id: string;
  approver_id: string;
  step: number;
  is_active: boolean;
  created_at: string;
  department?: Department;
  approver?: User;
}

export interface VehicleRequest {
  id: string;
  request_no: string;
  requester_id: string;
  department_id: string;
  purpose_id: string;
  vehicle_group_id: string;
  preferred_vehicle_id: string | null;
  destination: string;
  passengers: number;
  start_datetime: string;
  end_datetime: string;
  reason: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  requester?: User;
  department?: Department;
  purpose?: Purpose;
  vehicle_group?: VehicleGroup;
  preferred_vehicle?: Vehicle;
  approvals?: Approval[];
  dispatch?: Dispatch;
}

export interface Approval {
  id: string;
  request_id: string;
  approver_id: string;
  step: number;
  status: ApprovalStatus;
  comment: string | null;
  approved_at: string | null;
  created_at: string;
  approver?: User;
  request?: VehicleRequest;
}

export interface Dispatch {
  id: string;
  request_id: string;
  vehicle_id: string;
  driver_id: string | null;
  dispatcher_id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: DispatchStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
  driver?: Driver;
  dispatcher?: User;
  request?: VehicleRequest;
  return_info?: ReturnInfo;
}

export interface ReturnInfo {
  id: string;
  dispatch_id: string;
  returned_by: string;
  return_datetime: string;
  end_mileage: number;
  fuel_level: FuelLevel;
  condition: string | null;
  notes: string | null;
  created_at: string;
  user?: User;
}

export interface MileageLog {
  id: string;
  dispatch_id: string;
  vehicle_id: string;
  driver_id: string | null;
  start_mileage: number;
  end_mileage: number | null;
  distance: number | null;
  log_date: string;
  route: string | null;
  notes: string | null;
  created_at: string;
  vehicle?: Vehicle;
  driver?: Driver;
}

export interface Maintenance {
  id: string;
  vehicle_id: string;
  maintenance_type: MaintenanceType;
  description: string | null;
  cost: number | null;
  maintenance_date: string;
  next_maintenance_date: string | null;
  performed_by: string | null;
  created_at: string;
  vehicle?: Vehicle;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DashboardStats {
  total_requests: number;
  pending_requests: number;
  approved_requests: number;
  active_dispatches: number;
  available_vehicles: number;
  total_vehicles: number;
  monthly_requests: number;
}
