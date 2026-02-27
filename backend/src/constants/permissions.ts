export type Role = 'admin' | 'sales_manager' | 'salesperson' | 'operations' | 'accountant' | 'view_only';

export type Module =
  | 'dashboard'
  | 'contacts'
  | 'leads'
  | 'itineraries'
  | 'invoices'
  | 'payments'
  | 'vouchers'
  | 'suppliers'
  | 'rate_cards'
  | 'travellers'
  | 'visa'
  | 'communications'
  | 'campaigns'
  | 'tasks'
  | 'planner'
  | 'fleet'
  | 'reports'
  | 'settings'
  | 'users'
  | 'marketing';

export type Permission = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'import';

const ALL: Permission[] = ['view', 'create', 'edit', 'delete', 'export', 'import'];
const VIEW_ONLY_PERMS: Permission[] = ['view'];
const VIEW_EXPORT: Permission[] = ['view', 'export'];
const VIEW_CREATE_EDIT: Permission[] = ['view', 'create', 'edit'];

type PermissionMatrix = Record<Role, Partial<Record<Module, Permission[]>>>;

export const PERMISSIONS: PermissionMatrix = {
  admin: {
    dashboard: ALL,
    contacts: ALL,
    leads: ALL,
    itineraries: ALL,
    invoices: ALL,
    payments: ALL,
    vouchers: ALL,
    suppliers: ALL,
    rate_cards: ALL,
    travellers: ALL,
    visa: ALL,
    communications: ALL,
    campaigns: ALL,
    tasks: ALL,
    planner: ALL,
    fleet: ALL,
    reports: ALL,
    settings: ALL,
    users: ALL,
    marketing: ALL,
  },
  sales_manager: {
    dashboard: VIEW_ONLY_PERMS,
    contacts: ALL,
    leads: ALL,
    itineraries: ALL,
    invoices: VIEW_CREATE_EDIT,
    payments: VIEW_ONLY_PERMS,
    vouchers: VIEW_CREATE_EDIT,
    suppliers: VIEW_ONLY_PERMS,
    rate_cards: VIEW_ONLY_PERMS,
    travellers: ALL,
    visa: ALL,
    communications: ALL,
    campaigns: ALL,
    tasks: ALL,
    planner: ALL,
    fleet: VIEW_ONLY_PERMS,
    reports: VIEW_EXPORT,
    marketing: ALL,
  },
  salesperson: {
    dashboard: VIEW_ONLY_PERMS,
    contacts: VIEW_CREATE_EDIT,
    leads: VIEW_CREATE_EDIT,
    itineraries: VIEW_CREATE_EDIT,
    invoices: VIEW_ONLY_PERMS,
    payments: VIEW_ONLY_PERMS,
    vouchers: VIEW_ONLY_PERMS,
    travellers: VIEW_CREATE_EDIT,
    visa: VIEW_CREATE_EDIT,
    communications: ['view', 'create'],
    campaigns: ['view'],
    tasks: VIEW_CREATE_EDIT,
    planner: VIEW_CREATE_EDIT,
  },
  operations: {
    dashboard: VIEW_ONLY_PERMS,
    contacts: VIEW_ONLY_PERMS,
    leads: VIEW_ONLY_PERMS,
    itineraries: VIEW_CREATE_EDIT,
    vouchers: ALL,
    suppliers: ALL,
    rate_cards: ALL,
    travellers: VIEW_CREATE_EDIT,
    visa: ALL,
    fleet: ALL,
    campaigns: ['view'],
    tasks: VIEW_CREATE_EDIT,
    planner: VIEW_CREATE_EDIT,
  },
  accountant: {
    dashboard: VIEW_ONLY_PERMS,
    contacts: VIEW_ONLY_PERMS,
    leads: VIEW_ONLY_PERMS,
    invoices: ALL,
    payments: ALL,
    suppliers: VIEW_ONLY_PERMS,
    reports: ALL,
  },
  view_only: {
    dashboard: VIEW_ONLY_PERMS,
    contacts: VIEW_ONLY_PERMS,
    leads: VIEW_ONLY_PERMS,
    itineraries: VIEW_ONLY_PERMS,
    invoices: VIEW_ONLY_PERMS,
    payments: VIEW_ONLY_PERMS,
    vouchers: VIEW_ONLY_PERMS,
    suppliers: VIEW_ONLY_PERMS,
    travellers: VIEW_ONLY_PERMS,
    campaigns: VIEW_ONLY_PERMS,
    reports: VIEW_ONLY_PERMS,
  },
};

export function hasPermission(
  role: Role,
  module: Module,
  permission: Permission
): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.includes(permission);
}
