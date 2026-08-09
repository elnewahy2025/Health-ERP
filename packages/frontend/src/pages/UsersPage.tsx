import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, UserCog, RefreshCw, ShieldAlert, LogOut, KeyRound, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { usersApi, branchesApi, departmentsApi, rolesApi, type UserListItem, type UserDetail, type RoleItem } from '../lib/api/users';
import { useAuth } from '../stores/authStore';

const EMPLOYEE_TYPES = ['staff', 'doctor', 'nurse', 'pharmacist', 'technician', 'receptionist', 'accountant', 'manager', 'administrator'];

const statusColor: Record<string, 'success' | 'warning' | 'danger' | 'gray'> = {
  active: 'success',
  inactive: 'gray',
  suspended: 'danger',
};

export default function UsersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<Array<Record<string, unknown>>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await usersApi.list({
        page, limit, search: search || undefined,
        status: statusFilter || undefined, employeeType: typeFilter || undefined,
      });
      setUsers(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    rolesApi.list().then((r) => setRoles(r)).catch(() => {});
    branchesApi.list().then((r) => setBranches(r)).catch(() => {});
    departmentsApi.list().then((r) => setDepartments(r)).catch(() => {});
  }, []);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 4000);
  };

  const openDetail = useCallback(async (userId: string) => {
    try {
      const detail = await usersApi.get(userId);
      setSelectedUser(detail);
      setAuditLoading(true);
      const audit = await usersApi.audit(userId);
      setSelectedAudit(audit.items ?? []);
    } catch {
      showNotice('Failed to load user details');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const handleCreate = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const result = await usersApi.create(payload);
      setShowCreate(false);
      load();
      showNotice(`User created. Temporary password: ${result.temporaryPassword}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create user';
      showNotice(msg);
    } finally {
      setBusy(false);
    }
  }, [load]);

  const handleStatus = useCallback(async (userId: string, status: string) => {
    if (!window.confirm(`Change this user's status to ${status}?`)) return;
    setBusy(true);
    try {
      await usersApi.setStatus(userId, status);
      showNotice(`User ${status}`);
      load();
      if (selectedUser?.id === userId) setSelectedUser(null);
    } catch (e: unknown) {
      showNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update status');
    } finally {
      setBusy(false);
    }
  }, [load, selectedUser]);

  const handleResetPassword = useCallback(async (userId: string) => {
    if (!window.confirm('Reset this user\'s password? All their sessions will be terminated.')) return;
    setBusy(true);
    try {
      const result = await usersApi.resetPassword(userId);
      showNotice(`Temporary password: ${result.temporaryPassword}`);
    } catch (e: unknown) {
      showNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleForceLogout = useCallback(async (userId: string) => {
    if (!window.confirm('Force logout — revoke all sessions for this user?')) return;
    setBusy(true);
    try {
      await usersApi.forceLogout(userId);
      showNotice('All sessions revoked');
    } catch (e: unknown) {
      showNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to revoke sessions');
    } finally {
      setBusy(false);
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.userManagement', 'User Management')}</h1>
          <p className="text-sm text-gray-500 mt-1">Staff accounts, roles, branches, departments, and access status.</p>
        </div>
        {can('users.create') && (
          <Button onClick={() => setShowCreate(true)} icon={<Plus className="w-4 h-4" />}>
            New User
          </Button>
        )}
      </div>

      {notice && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{notice}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <Card>
        <CardBody className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or phone"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select
              placeholder="All statuses"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'suspended', label: 'Suspended' },
              ]}
              className="w-40"
            />
            <Select
              placeholder="All types"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              options={[{ value: '', label: 'All employee types' }, ...EMPLOYEE_TYPES.map((et) => ({ value: et, label: et }))]}
              className="w-48"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : users.length === 0 ? (
            <EmptyState title="No users found" message="Try adjusting your search or filters." />
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Roles</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Branches</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Last login</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{u.employeeType}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles ?? []).map((r) => <Badge key={r} variant="info">{r}</Badge>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.branches?.length || 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusColor[u.status] || 'gray'}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" icon={<UserCog className="w-4 h-4" />} onClick={() => openDetail(u.id)}>View</Button>
                      {can('users.manage') && u.status !== 'suspended' && (
                        <Button variant="ghost" size="sm" icon={<ShieldAlert className="w-4 h-4" />} onClick={() => handleStatus(u.id, 'suspended')}>Suspend</Button>
                      )}
                      {can('users.manage') && u.status !== 'active' && (
                        <Button variant="ghost" size="sm" onClick={() => handleStatus(u.id, 'active')}>Activate</Button>
                      )}
                      {can('users.manage') && (
                        <Button variant="ghost" size="sm" icon={<KeyRound className="w-4 h-4" />} onClick={() => handleResetPassword(u.id)}>Reset PW</Button>
                      )}
                      {can('users.manage') && (
                        <Button variant="ghost" size="sm" icon={<LogOut className="w-4 h-4" />} onClick={() => handleForceLogout(u.id)}>Logout</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-sm text-gray-500">Page {page} of {totalPages} ({total} users)</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <CreateUserModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleCreate}
        busy={busy}
        roles={roles}
        branches={branches}
        departments={departments}
      />

      <Modal open={Boolean(selectedUser)} onClose={() => setSelectedUser(null)} title="User Details" size="xl">
        {selectedUser && (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selectedUser.firstName} {selectedUser.lastName}</h3>
                <p className="text-sm text-gray-500">{selectedUser.email} · {selectedUser.phone || 'no phone'}</p>
              </div>
              <Badge variant={statusColor[selectedUser.status] || 'gray'}>{selectedUser.status}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><div className="text-gray-500">Employee type</div><div className="font-medium capitalize">{selectedUser.employeeType}</div></div>
              <div><div className="text-gray-500">Department</div><div className="font-medium">{selectedUser.department?.name || '—'}</div></div>
              <div><div className="text-gray-500">Position</div><div className="font-medium">{selectedUser.position || '—'}</div></div>
              <div><div className="text-gray-500">MFA</div><div className="font-medium">{selectedUser.mfaEnabled ? 'Enabled' : 'Disabled'}</div></div>
              <div><div className="text-gray-500">Last login</div><div className="font-medium">{selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : '—'}</div></div>
              <div><div className="text-gray-500">Password changed</div><div className="font-medium">{selectedUser.passwordChangedAt ? new Date(selectedUser.passwordChangedAt).toLocaleString() : '—'}</div></div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Roles</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedUser.roles?.map((r: { slug: string; name: string; level: string }) => (
                  <Badge key={r.slug} variant="info">{r.name} ({r.level})</Badge>
                )) || <span className="text-gray-400 text-sm">No roles assigned</span>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Branches</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedUser.branches?.map((b: { id: string; name: string; code: string }) => (
                  <Badge key={b.id} variant="success">{b.name}</Badge>
                )) || <span className="text-gray-400 text-sm">No branches assigned</span>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Active sessions ({selectedUser.sessions?.length || 0})</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {(selectedUser.sessions || []).map((s) => (
                  <div key={s.id} className="flex justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="truncate">{s.device || s.user_agent || 'Unknown device'} · {s.location || '—'}</span>
                    <span>{s.last_activity_at ? new Date(s.last_activity_at).toLocaleString() : '—'}</span>
                  </div>
                ))}
                {selectedUser.sessions?.length === 0 && <p className="text-xs text-gray-400">No active sessions</p>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Recent audit history</div>
              {auditLoading ? <Spinner /> : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {(selectedAudit || []).map((a: Record<string, unknown>) => (
                    <div key={String(a.id)} className="flex justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                      <span className="font-medium">{String(a.action)}</span>
                      <span>{a.timestamp ? new Date(String(a.timestamp)).toLocaleString() : '—'}</span>
                    </div>
                  ))}
                  {selectedAudit.length === 0 && <p className="text-xs text-gray-400">No audit events found</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CreateUserModal({
  open, onClose, onSave, busy, roles, branches, departments,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  busy: boolean;
  roles: RoleItem[];
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
}) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    employeeType: 'staff', departmentId: '', position: '', temporaryPassword: '',
  });
  const [roleSlugs, setRoleSlugs] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    onSave({
      ...form,
      departmentId: form.departmentId || undefined,
      temporaryPassword: form.temporaryPassword || undefined,
      roles: roleSlugs,
      branchIds,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Create User" size="lg" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={busy}>Create User</Button>
      </>
    }>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="First name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
        <Input label="Last name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        <Select
          label="Employee type"
          value={form.employeeType}
          onChange={(e) => set('employeeType', e.target.value)}
          options={EMPLOYEE_TYPES.map((et) => ({ value: et, label: et }))}
        />
        <Select
          label="Department"
          value={form.departmentId}
          onChange={(e) => set('departmentId', e.target.value)}
          options={[{ value: '', label: 'No department' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <Input label="Position" value={form.position} onChange={(e) => set('position', e.target.value)} />
        <Input label="Temporary password (optional, min 8 chars)" value={form.temporaryPassword} onChange={(e) => set('temporaryPassword', e.target.value)} />
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Roles</label>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <button
              key={r.slug}
              type="button"
              onClick={() => setRoleSlugs((prev) => prev.includes(r.slug) ? prev.filter((x) => x !== r.slug) : [...prev, r.slug])}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                roleSlugs.includes(r.slug) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {r.name}
            </button>
          ))}
          {roles.length === 0 && <span className="text-xs text-gray-400">Loading roles…</span>}
        </div>
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Branches</label>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBranchIds((prev) => prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id])}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                branchIds.includes(b.id) ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {b.name}
            </button>
          ))}
          {branches.length === 0 && <span className="text-xs text-gray-400">No branches available</span>}
        </div>
      </div>
    </Modal>
  );
}
