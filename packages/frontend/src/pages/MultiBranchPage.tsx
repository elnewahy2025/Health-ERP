import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Building2, Plus, MapPin, Phone, Users, Eye, Edit3, Trash2 } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Input, Select, Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { Can } from '../components/auth/Authorization';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

interface Branch {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
  address: string | null;
  city: string | null;
  governorate: string | null;
  phone: string | null;
  email: string | null;
  manager_name: string | null;
  is_active: boolean;
  type: string;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
  patient_count: number;
  today_appointments: number;
  total_revenue: number;
}

interface BranchForm {
  name: string;
  name_ar: string;
  code: string;
  address: string;
  city: string;
  governorate: string;
  phone: string;
  email: string;
  manager_name: string;
  type: string;
  capacity: string;
  is_active: boolean;
}

const EMPTY_FORM: BranchForm = {
  name: '', name_ar: '', code: '', address: '', city: '', governorate: '',
  phone: '', email: '', manager_name: '', type: 'branch', capacity: '', is_active: true,
};

const GOVERNORATES = [
  'Cairo', 'Alexandria', 'Giza', 'Luxor', 'Aswan', 'Port Said', 'Suez',
  'Ismailia', 'Mansoura', 'Tanta', 'Zagazig', 'Damanhur', 'Minya',
  'Asyut', 'Sohag', 'Qena', 'Hurghada', 'Sharm El Sheikh',
];

const TYPE_OPTIONS = [
  { value: 'main', labelKey: 'branches.main' },
  { value: 'branch', labelKey: 'branches.branchType' },
  { value: 'satellite', labelKey: 'branches.satellite' },
  { value: 'virtual', labelKey: 'branches.virtual' },
];

const TYPE_COLORS: Record<string, string> = {
  main: 'bg-blue-100 text-blue-700',
  branch: 'bg-green-100 text-green-700',
  satellite: 'bg-purple-100 text-purple-700',
  virtual: 'bg-orange-100 text-orange-700',
};

export default function MultiBranchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const fetchBranches = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterType) params.set('type', filterType);
      const { data } = await api.get(`/branches?${params}`);
      setBranches((data?.data?.rows ?? data?.data ?? []) as Branch[]);
    } catch {
      toast.error(t('branches.loadError'));
    }
  }, [search, filterType, t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (filterType) params.set('type', filterType);
        const { data } = await api.get(`/branches?${params}`);
        if (!cancelled) setBranches((data?.data?.rows ?? data?.data ?? []) as Branch[]);
      } catch {
        if (!cancelled) toast.error(t('branches.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [search, filterType, t]);

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = t('branches.nameRequired');
    if (!form.code.trim()) errors.code = t('branches.codeRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form.name, form.code, t]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = {
        name: sanitizeString(form.name),
        name_ar: form.name_ar ? sanitizeString(form.name_ar) : undefined,
        code: sanitizeString(form.code),
        address: form.address ? sanitizeString(form.address) : undefined,
        city: form.city ? sanitizeString(form.city) : undefined,
        governorate: form.governorate || undefined,
        phone: form.phone ? sanitizeString(form.phone) : undefined,
        email: form.email || undefined,
        manager_name: form.manager_name ? sanitizeString(form.manager_name) : undefined,
        type: form.type,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        is_active: form.is_active,
      };
      if (editBranch) {
        await api.put(`/branches/${editBranch.id}`, payload);
        toast.success(t('branches.updateSuccess'));
      } else {
        await api.post('/branches', payload);
        toast.success(t('branches.createSuccess'));
      }
      setShowModal(false);
      setEditBranch(null);
      setForm(EMPTY_FORM);
      void fetchBranches();
    } catch {
      toast.error(editBranch ? t('branches.updateError') : t('branches.createError'));
    } finally {
      setSaving(false);
    }
  }, [form, editBranch, validateForm, fetchBranches, t]);

  const handleEdit = useCallback((b: Branch) => {
    setEditBranch(b);
    setForm({
      name: b.name, name_ar: b.name_ar || '', code: b.code,
      address: b.address || '', city: b.city || '', governorate: b.governorate || '',
      phone: b.phone || '', email: b.email || '', manager_name: b.manager_name || '',
      type: b.type, capacity: b.capacity?.toString() || '', is_active: b.is_active,
    });
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteBranch) return;
    setDeleting(true);
    try {
      await api.delete(`/branches/${deleteBranch.id}`);
      toast.success(t('branches.deleteSuccess'));
      setShowDeleteModal(false);
      setDeleteBranch(null);
      void fetchBranches();
    } catch {
      toast.error(t('branches.deleteError'));
    } finally {
      setDeleting(false);
    }
  }, [deleteBranch, t, fetchBranches]);

  const openCreate = useCallback(() => {
    setEditBranch(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowModal(true);
  }, []);

  const formatCurrency = useClinicMoney();

  if (loading) return <PageLoader message={t('common.loading')} />;

  const totalPatients = branches.reduce((sum, b) => sum + (b.patient_count ?? 0), 0);
  const totalAppts = branches.reduce((sum, b) => sum + (b.today_appointments ?? 0), 0);

  const govOptions = [{ value: '', label: t('branches.selectGovernorate') }, ...GOVERNORATES.map((g) => ({ value: g, label: g }))];
  const typeFormOptions = TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('branches.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('branches.subtitle')}</p>
        </div>
        <Can permission="branches.manage">
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> {t('branches.addBranch')}
          </Button>
        </Can>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Building2 className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">{t('branches.totalBranches')}</p><p className="text-xl font-bold">{branches.length}</p></div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><Building2 className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">{t('branches.activeBranches')}</p><p className="text-xl font-bold">{branches.filter((b) => b.is_active).length}</p></div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><Users className="w-5 h-5 text-purple-600" /></div>
              <div><p className="text-sm text-gray-500">{t('branches.totalPatients')}</p><p className="text-xl font-bold">{totalPatients}</p></div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg"><Users className="w-5 h-5 text-yellow-600" /></div>
              <div><p className="text-sm text-gray-500">{t('branches.todayAppts')}</p><p className="text-xl font-bold">{totalAppts}</p></div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Input placeholder={t('branches.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">{t('branches.allTypes')}</option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
      </div>

      {branches.length === 0 ? (
        <EmptyState title={t('branches.noBranches')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => (
            <Card key={b.id}>
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-100 rounded-lg"><Building2 className="w-5 h-5 text-primary-600" /></div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{sanitizeString(b.name)}</h3>
                      <p className="text-xs text-gray-500">{sanitizeString(b.code)}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${TYPE_COLORS[b.type] ?? 'bg-gray-100 text-gray-700'}`}>
                    {sanitizeString(b.type)}
                  </span>
                </div>
                {b.address && (
                  <p className="text-sm text-gray-600 flex items-center gap-1 mb-2">
                    <MapPin className="w-3.5 h-3.5" /> {sanitizeString(b.address)}, {sanitizeString(b.city ?? '')}, {sanitizeString(b.governorate ?? '')}
                  </p>
                )}
                {b.phone && (
                  <p className="text-sm text-gray-600 flex items-center gap-1 mb-2">
                    <Phone className="w-3.5 h-3.5" /> {sanitizeString(b.phone)}
                  </p>
                )}
                {b.manager_name && <p className="text-sm text-gray-600 mb-2">{t('branches.manager')}: {sanitizeString(b.manager_name)}</p>}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{b.patient_count ?? 0}</p>
                    <p className="text-xs text-gray-500">{t('branches.patients')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{b.today_appointments ?? 0}</p>
                    <p className="text-xs text-gray-500">{t('branches.apptsToday')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-yellow-600">{formatCurrency(b.total_revenue ?? 0)}</p>
                    <p className="text-xs text-gray-500">{t('branches.revenue')}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/branches/${b.id}`)} className="flex-1">
                    <Eye className="w-3.5 h-3.5" /> {t('branches.view')}
                  </Button>
                  <Can permission="branches.manage">
                    <Button size="sm" variant="secondary" onClick={() => handleEdit(b)} className="flex-1">
                      <Edit3 className="w-3.5 h-3.5" /> {t('branches.edit')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setDeleteBranch(b); setShowDeleteModal(true); }}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </Can>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditBranch(null); }} title={editBranch ? t('branches.editBranch') : t('branches.newBranch')}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('branches.branchName') + ' *'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={formErrors.name} />
            <Input label={t('branches.arabicName')} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            <Input label={t('branches.branchCode') + ' *'} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} error={formErrors.code} />
            <Select label={t('branches.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={typeFormOptions} />
          </div>
          <Input label={t('branches.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={t('branches.governorate')} value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })} options={govOptions} />
            <Input label={t('branches.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('branches.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label={t('branches.email')} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('branches.managerName')} value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} />
            <Input label={t('branches.capacity')} type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => { setShowModal(false); setEditBranch(null); }}>{t('branches.cancel')}</Button>
            <Can permission="branches.manage">
              <Button onClick={handleSubmit} loading={saving} disabled={saving}>
                {editBranch ? t('branches.update') : t('branches.create')}
              </Button>
            </Can>
          </div>
        </div>
      </Modal>

      <Modal open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteBranch(null); }} title={t('branches.delete')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('branches.confirmDelete')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowDeleteModal(false); setDeleteBranch(null); }}>{t('branches.cancel')}</Button>
            <Can permission="branches.manage">
              <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleting}>{t('branches.delete')}</Button>
            </Can>
          </div>
        </div>
      </Modal>
    </div>
  );
}
