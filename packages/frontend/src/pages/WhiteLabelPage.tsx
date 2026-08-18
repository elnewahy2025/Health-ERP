import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  whiteLabelApi,
  type TenantDomain,
} from '../lib/api';
import { escapeHtml, sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import {
  Input,
  Button,
  Badge,
  EmptyState,
  PageLoader,
} from '../components/ui';
import { confirmDialog } from '../components/ui';
import {
  Palette,
  Globe,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useClinicConfiguration } from '../stores/clinicConfigurationStore';

type TabType = 'branding' | 'domains';

const COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

export default function WhiteLabelPage() {
  const { t } = useTranslation();
  const { identity } = useClinicConfiguration();

  const [tab, setTab] = useState<TabType>('branding');
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Branding form
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0D9488');
  const [secondaryColor, setSecondaryColor] = useState('#14B8A6');
  const [accentColor, setAccentColor] = useState('#F59E0B');
  const [fontFamily, setFontFamily] = useState('Inter');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Domain form
  const [newDomain, setNewDomain] = useState('');
  const [domainError, setDomainError] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [brandRes, domRes] = await Promise.allSettled([
          whiteLabelApi.getBranding(),
          whiteLabelApi.listDomains(),
        ]);
        if (cancelled) return;
        if (brandRes.status === 'fulfilled') {
          const b = brandRes.value;
          // branding loaded
          setBrandName(b.brandName ?? '');
          setPrimaryColor(b.primaryColor ?? '#0D9488');
          setSecondaryColor(b.secondaryColor ?? '#14B8A6');
          setAccentColor(b.accentColor ?? '#F59E0B');
          setFontFamily(b.fontFamily ?? 'Inter');
        }
        if (domRes.status === 'fulfilled') setDomains(domRes.value);
        if (brandRes.status === 'rejected' && domRes.status === 'rejected') {
          setError(t('wl.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('wl.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [t]);

  const validateBranding = (): boolean => {
    const errors: Record<string, string> = {};
    if (brandName && brandName.length > 200) {
      errors.brandName = t('common.maxLength', { max: 200 });
    }
    if (!COLOR_REGEX.test(primaryColor)) {
      errors.primaryColor = t('wl.colorHelp');
    }
    if (!COLOR_REGEX.test(secondaryColor)) {
      errors.secondaryColor = t('wl.colorHelp');
    }
    if (!COLOR_REGEX.test(accentColor)) {
      errors.accentColor = t('wl.colorHelp');
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveBranding = async () => {
    if (!validateBranding()) return;
    setSaving(true);
    try {
      await whiteLabelApi.updateBranding({
        brandName: sanitizeString(brandName) || undefined,
        primaryColor,
        secondaryColor,
        accentColor,
        fontFamily: sanitizeString(fontFamily) || undefined,
      });
      toast.success(t('wl.brandingSaved'));
      await whiteLabelApi.getBranding();
      // branding refreshed in state
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const validateDomain = (domain: string): boolean => {
    if (!domain.trim()) {
      setDomainError(t('common.required'));
      return false;
    }
    if (!DOMAIN_REGEX.test(domain)) {
      setDomainError(t('wl.domainHelp'));
      return false;
    }
    if (domains.some((d) => d.domain === domain)) {
      setDomainError(t('wl.domainExists'));
      return false;
    }
    setDomainError('');
    return true;
  };

  const handleAddDomain = async () => {
    const domain = sanitizeString(newDomain).toLowerCase();
    if (!validateDomain(domain)) return;
    setAddingDomain(true);
    try {
      await whiteLabelApi.addDomain({ domain });
      toast.success(t('wl.domainAdded'));
      setNewDomain('');
      setDomainError('');
      const updated = await whiteLabelApi.listDomains();
      setDomains(updated);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setAddingDomain(false);
    }
  };

  const handleDeleteDomain = async (id: string) => {
    const confirmed = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete'), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true });
    if (!confirmed) return;
    try {
      await whiteLabelApi.deleteDomain(id);
      toast.success(t('wl.domainDeleted'));
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleVerifyDomain = async (id: string) => {
    try {
      await whiteLabelApi.verifyDomain(id);
      toast.success(t('wl.verified'));
      const updated = await whiteLabelApi.listDomains();
      setDomains(updated);
    } catch {
      toast.error(t('common.error'));
    }
  };

  if (loading) {
    return <PageLoader message={t('common.loading')} />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12 text-red-400" />}
          title={t('common.error')}
          message={error}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Palette className="w-6 h-6" /> {t('wl.title')}
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'branding' ? 'primary' : 'secondary'}
          onClick={() => setTab('branding')}
        >
          <Palette className="w-4 h-4" /> {t('wl.branding')}
        </Button>
        <Button
          variant={tab === 'domains' ? 'primary' : 'secondary'}
          onClick={() => setTab('domains')}
        >
          <Globe className="w-4 h-4" />
          <span className="ml-1">{t('wl.domains')} ({domains.length})</span>
        </Button>
      </div>

      {/* Branding Tab */}
      {tab === 'branding' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Brand Identity Form */}
          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="font-semibold mb-4">{t('wl.brandIdentity')}</h3>
            <div className="space-y-4">
              <Input
                label={t('wl.brandName')}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                error={formErrors.brandName}
                helpText={t('wl.brandNameHelp')}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('wl.primaryColor')}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    error={formErrors.primaryColor}
                    className="flex-1"
                  />
                  <div
                    className="w-10 h-10 rounded border shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('wl.secondaryColor')}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    error={formErrors.secondaryColor}
                    className="flex-1"
                  />
                  <div
                    className="w-10 h-10 rounded border shrink-0"
                    style={{ backgroundColor: secondaryColor }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('wl.accentColor')}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    error={formErrors.accentColor}
                    className="flex-1"
                  />
                  <div
                    className="w-10 h-10 rounded border shrink-0"
                    style={{ backgroundColor: accentColor }}
                  />
                </div>
              </div>

              <Input
                label={t('wl.fontFamily')}
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                helpText={t('wl.fontHelp')}
              />

              <Button onClick={handleSaveBranding} loading={saving}>
                {t('wl.saveBranding')}
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="font-semibold mb-4">{t('wl.preview')}</h3>
            <div className="p-6 rounded-lg border bg-white">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: primaryColor }}
              >
                <span className="text-white text-xl font-bold">
                  {(brandName || identity?.displayName || t('wl.defaultBrandName')).charAt(0).toUpperCase() || 'C'}
                </span>
              </div>
              <p
                className="text-xl font-bold"
                style={{ fontFamily }}
              >
                {brandName || identity?.displayName || t('wl.defaultBrandName')}
              </p>
              <div className="flex gap-2 mt-2">
                <span
                  className="px-3 py-1 rounded-full text-xs text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {t('wl.primaryColor')}
                </span>
                <span
                  className="px-3 py-1 rounded-full text-xs text-white"
                  style={{ backgroundColor: secondaryColor }}
                >
                  {t('wl.secondaryColor')}
                </span>
                <span
                  className="px-3 py-1 rounded-full text-xs text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  {t('wl.accentColor')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Domains Tab */}
      {tab === 'domains' && (
        <div>
          {/* Add Domain */}
          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800 mb-6">
            <div className="flex gap-2">
              <div className="flex-1 max-w-md">
                <Input
                  placeholder={t('wl.domainPlaceholder')}
                  value={newDomain}
                  onChange={(e) => {
                    setNewDomain(e.target.value);
                    setDomainError('');
                  }}
                  error={domainError}
                />
              </div>
              <Button onClick={handleAddDomain} loading={addingDomain}>
                <Plus className="w-4 h-4 mr-1" /> {t('wl.addDomain')}
              </Button>
            </div>
          </div>

          {/* Domains Table */}
          <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('wl.domain')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('wl.primary')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('wl.verified')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('wl.ssl')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('wl.verifiedAt')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {domains.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<Globe className="w-12 h-12 text-gray-300" />}
                        title={t('wl.noDomains')}
                        message={t('common.noData')}
                      />
                    </td>
                  </tr>
                ) : (
                  domains.map((d) => (
                    <tr key={d.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="p-3 text-sm font-medium">{escapeHtml(d.domain)}</td>
                      <td className="p-3">
                        {d.isPrimary ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-400" />
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={d.isVerified ? 'success' : 'warning'}>
                          {d.isVerified ? t('wl.verified') : t('wl.pending')}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={d.sslStatus === 'active' ? 'success' : 'gray'}>
                          {escapeHtml(d.sslStatus)}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {formatDateTime(d.verifiedAt) || '-'}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {!d.isVerified && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleVerifyDomain(d.id)}
                            >
                              {t('wl.verified')}
                            </Button>
                          )}
                          <button
                            onClick={() => void handleDeleteDomain(d.id)}
                            className="text-red-400 hover:text-red-600 text-xs px-2"
                            aria-label="Delete"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
