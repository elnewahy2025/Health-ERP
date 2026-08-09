import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil, Shield } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { rolesApi, type RoleItem, type RoleGrant } from '../lib/api/users';
import { useAuth } from '../stores/authStore';

const SCOPES = ['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system'];

export default function RolesPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await rolesApi.list();
      setRoles(data);
    } catch {
      setNotice('Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 4000);
  };

  const handleDelete = useCallback(async (role: RoleItem) => {
    if (!role.id || role.isSystem) return;
    if (!window.confirm(`Delete role "${role.name}"? Users will lose this role's permissions.`)) return;
    try {
      await rolesApi.remove(role.id);
      showNotice('Role deleted');
      load();
    } catch (e: unknown) {
      showNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete role');
    }
  }, [load]);

  const handleSave = useCallback(async (roleId: string | undefined, payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (roleId) {
        await rolesApi.update(roleId, payload);
        showNotice('Role updated');
      } else {
        await rolesApi.create(payload);
        showNotice('Role created');
      }
      setEditing(null);
      load();
    } catch (e: unknown) {
      showNotice((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save role');
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.roleManagement', 'Role & Permission Management')}</h1>
          <p className="text-sm text-gray-500 mt-1">Granular module × action permissions with scope for every role.</p>
        </div>
        {can('roles.create') && (
          <Button onClick={() => setEditing({ name: '', slug: '', level: 'custom', scopeDefault: 'tenant', description: null, grants: [] })} icon={<Plus className="w-4 h-4" />}>
            New Role
          </Button>
        )}
      </div>

      {notice && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{notice}</div>}

      <Card>
        <CardBody className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : roles.length === 0 ? (
            <EmptyState title="No roles found" />
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Level</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Default scope</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Permissions</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.map((r) => (
                  <tr key={r.slug} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="text-xs text-gray-400">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3"><Badge variant={r.level === 'system' ? 'danger' : r.level === 'tenant' ? 'info' : 'gray'}>{r.level}</Badge></td>
                    <td className="px-4 py-3 text-gray-600">{r.scopeDefault}</td>
                    <td className="px-4 py-3 text-gray-600">{r.grants?.length || 0} grants</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {can('roles.edit') && (
                        <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing({ ...r })}>Edit</Button>
                      )}
                      {can('roles.delete') && !r.isSystem && r.id && (
                        <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(r)}>Delete</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {editing && (
        <RoleEditorModal
          role={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          busy={busy}
        />
      )}
    </div>
  );
}

function RoleEditorModal({
  role, onClose, onSave, busy,
}: {
  role: RoleItem;
  onClose: () => void;
  onSave: (roleId: string | undefined, payload: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(role.name);
  const [slug, setSlug] = useState(role.slug);
  const [description, setDescription] = useState(role.description || '');
  const [scopeDefault, setScopeDefault] = useState(role.scopeDefault);
  const [catalog, setCatalog] = useState<{ modules: string[]; actions: string[] }>({ modules: [], actions: [] });
  const [grants, setGrants] = useState<Record<string, RoleGrant>>(
    () => Object.fromEntries((role.grants || []).map((g) => [`${g.permission}:${g.scope}`, g]))
  );

  useEffect(() => {
    rolesApi.permissions().then((data) => setCatalog(data)).catch(() => {});
  }, []);

  const toggleGrant = (permission: string, scope: string) => {
    setGrants((prev) => {
      const next = { ...prev };
      const key = `${permission}:${scope}`;
      if (next[key]) delete next[key];
      else next[key] = { permission, scope };
      return next;
    });
  };

  const toggleModule = (module: string, scope: string) => {
    setGrants((prev) => {
      const next = { ...prev };
      for (const action of catalog.actions) {
        const key = `${module}.${action}:${scope}`;
        if (next[key]) delete next[key];
        else next[key] = { permission: `${module}.${action}`, scope };
      }
      return next;
    });
  };

  const selectedFor = (module: string, scope: string) =>
    catalog.actions.every((a) => grants[`${module}.${a}:${scope}`]);

  const handleSave = () => {
    onSave(role.id, {
      name,
      slug,
      description: description || null,
      scopeDefault,
      grants: Object.values(grants),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={role.id ? `Edit role: ${role.name}` : 'Create custom role'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={busy} disabled={!slug}>{role.id ? 'Save changes' : 'Create role'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input label="Role name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Slug (lowercase, no spaces)" value={slug} disabled={Boolean(role.id)} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select
          label="Default scope"
          value={scopeDefault}
          onChange={(e) => setScopeDefault(e.target.value)}
          options={SCOPES.map((s) => ({ value: s, label: s }))}
        />
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 flex items-center gap-2 text-xs font-medium text-gray-500">
          <Shield className="w-4 h-4" />
          Permission matrix — module × action × scope
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
          {catalog.modules.map((module) => (
            <div key={module} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-800">{module}</span>
                <div className="flex items-center gap-2">
                  {SCOPES.map((scope) => (
                    <label key={scope} className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-primary-600"
                        checked={selectedFor(module, scope)}
                        onChange={() => toggleModule(module, scope)}
                      />
                      {scope}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {catalog.actions.map((action) => (
                  <div key={`${module}.${action}`} className="flex items-center gap-1">
                    <label className="flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-primary-600"
                        checked={Boolean(grants[`${module}.${action}:${scopeDefault}`])}
                        onChange={() => toggleGrant(`${module}.${action}`, scopeDefault)}
                      />
                      {action}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {catalog.modules.length === 0 && <div className="p-6 text-sm text-gray-400">Loading permission catalog…</div>}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {Object.keys(grants).length} grant(s) selected. Scopes: self → own records, assigned_patients → assigned patients,
        department / branch / branches → department or branch data, tenant → entire organization, system → all tenants.
      </p>
    </Modal>
  );
}
