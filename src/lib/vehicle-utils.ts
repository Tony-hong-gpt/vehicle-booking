export function vehicleName(vehicle: { name: string; model?: string | null } | null | undefined): string {
  if (!vehicle) return '-';
  return [vehicle.name, vehicle.model].filter(Boolean).join(' ');
}
