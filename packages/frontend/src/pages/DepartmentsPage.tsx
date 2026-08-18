import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Building2, Edit3, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardBody, EmptyState, Input, Modal, PageLoader } from '../components/ui';
import { departmentsApi } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { Can } from '../components/auth/Authorization';
import { confirmDialog } from '../components/ui';

interface Department {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

interface DepartmentForm {
  name: string;
  code: string;
}

const EMPTY_FORM: DepartmentForm = { name: '', code: '' };

export default function DepartmentsPage() {
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentForm>(EMPTY_FORM);
  const [showModal, setShowModal] = useState(false);

  const loadDepartments = useCallback(async () => {
    try {
      setDepartments(await departmentsApi.list());
    } catch {
      toast.error(t('departments.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (department: Department) => {
    setEditing(department);
    setForm({ name: department.name, code: department.code });
    setShowModal(true);
  };

  const handleSave = async () => {
    const name = sanitizeString(form.name).trim();
    const code = sanitizeString(form.code).trim();
    if (!name || !code) {
      toast.error(t('departments.required'));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await departmentsApi.update(editing.id, { name, code });
        toast.success(t('departments.updateSuccess'));
      } else {
        await departmentsApi.create({ name, code });
        toast.success(t('departments.createSuccess'));
      }
      setShowModal(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await loadDepartments();
    } catch {
      toast.error(editing ? t('departments.updateError') : t('departments.createError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (department: Department) => {
    const confirmed = await confirmDialog({
      title: t('departments.deleteTitle'),
      message: t('departments.deleteMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await departmentsApi.remove(department.id);
      toast.success(t('departments.deleteSuccess'));
      await loadDepartments();
    } catch {
      toast.error(t('departments.deleteError'));
    }
  };

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary-600" />
            {t('departments.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('departments.subtitle')}</p>
        </div>
        <Can permission="departments.create">
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> {t('departments.add')}
          </Button>
        </Can>
      </div>

      {departments.length === 0 ? (
        <EmptyState icon={<Building2 className="w-8 h-8 text-gray-400" />} title={t('departments.empty')} />
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('departments.name')}</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('departments.code')}</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('common.status')}</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr key={department.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-5 py-4 font-medium text-gray-900">{department.name}</td>
                      <td className="px-5 py-4 font-mono text-sm text-gray-600">{department.code}</td>
                      <td className="px-5 py-4"><Badge variant={department.isActive ? 'success' : 'gray'}>{department.isActive ? t('departments.active') : t('departments.inactive')}</Badge></td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Can permission="departments.edit">
                            <Button variant="ghost" size="sm" icon={<Edit3 className="w-4 h-4" />} onClick={() => openEdit(department)}>{t('common.edit')}</Button>
                          </Can>
                          <Can permission="departments.delete">
                            <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => void handleDelete(department)}>{t('common.delete')}</Button>
                          </Can>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('departments.editTitle') : t('departments.addTitle')}
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Can permission={editing ? 'departments.edit' : 'departments.create'}>
              <Button onClick={() => void handleSave()} loading={saving} disabled={saving}>{t('common.save')}</Button>
            </Can>
          </div>
        )}
      >
        <div className="space-y-4">
          <Input label={`${t('departments.name')} *`} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          <Input label={`${t('departments.code')} *`} value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
