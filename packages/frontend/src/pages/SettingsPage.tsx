import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserCog, Palette, Bell, Globe, Printer, Shield, Building2, Save, Loader2, Puzzle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardBody, Input, Button, Select } from '../components/ui';
import { apiClient as api, clinicConfigurationApi, type ClinicModuleReadiness, type ClinicModuleStatus } from '../lib/api';
import { Can } from '../components/auth/Authorization';
import toast from 'react-hot-toast';
import { CLINIC_CONFIGURATION_REGISTRY, clinicConfigurationDefinition } from '@healthcare/shared';
import type { ClinicConfigurationEntry, ClinicConfigurationScope } from '../lib/api/clinic-configuration';

interface ClinicSettings {
  clinicName: string;
  legalName: string;
  branch: string;
  landPhone: string;
  whatsappPhone: string;
  logoUrl: string;
  address: string;
  city: string;
  country: string;
  googleMapsLocation: string;
  email: string;
  website: string;
  workingHours: string;
  licenseNumber: string;
  taxNumber: string;
  currency: string;
  timezone: string;
  locale: string;
  twilioConfigured?: boolean;
}

type SettingsTab = 'clinic' | 'modules' | 'navigation';
type ScopedSettingsType = Exclude<ClinicConfigurationScope, 'tenant'>;
interface ScopeOption { id: string; name: string; code?: string; }


const DEFAULT_CLINIC_CURRENCY = String(
  clinicConfigurationDefinition('clinic.finance.currency')?.defaultValue || '',
);

const INITIAL_CLINIC: ClinicSettings = {
  clinicName: '', legalName: '', branch: '', landPhone: '', whatsappPhone: '', logoUrl: '',
  address: '', city: '', country: '', googleMapsLocation: '', email: '',
  website: '', workingHours: '', licenseNumber: '', taxNumber: '', currency: DEFAULT_CLINIC_CURRENCY, timezone: 'UTC', locale: 'en',
};

function moduleLabel(moduleKey: string): string {
  return moduleKey
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const CONFIGURATION_FIELD_IDS: Record<string, string> = {
  'clinic.profile.display_name': 'clinic-settings-clinic-name',
  'clinic.profile.legal_name': 'clinic-settings-legal-name',
  'clinic.profile.branch_label': 'clinic-settings-branch',
  'clinic.profile.logo_url': 'clinic-settings-logo-url',
  'clinic.contact.email': 'clinic-settings-email',
  'clinic.contact.land_phone': 'clinic-settings-land-phone',
  'clinic.contact.whatsapp_phone': 'clinic-settings-whatsapp-phone',
  'clinic.contact.website': 'clinic-settings-website',
  'clinic.address.street': 'clinic-settings-address',
  'clinic.address.city': 'clinic-settings-city',
  'clinic.address.country': 'clinic-settings-country',
  'clinic.address.maps_url': 'clinic-settings-maps-url',
  'clinic.operations.working_hours': 'clinic-settings-working-hours',
  'clinic.legal.license_number': 'clinic-settings-license-number',
  'clinic.legal.tax_number': 'clinic-settings-tax-number',
  'clinic.finance.currency': 'clinic-settings-currency',
  'clinic.timezone.default': 'clinic-settings-timezone',
  'clinic.locale.default': 'clinic-settings-locale',
};

function validationKeys(module: ClinicModuleStatus, readiness?: ClinicModuleReadiness): string[] {
  if (readiness) return readiness.missingRequiredKeys;
  return Array.isArray(module.validationErrors)
    ? module.validationErrors.filter((key): key is string => typeof key === 'string')
    : [];
}

function serializeScopedValue(entry: ClinicConfigurationEntry): string {
  if (entry.definition.valueType === 'json') return JSON.stringify(entry.value ?? [], null, 2);
  return entry.value === undefined || entry.value === null ? '' : String(entry.value);
}

function scopeOptions(value: unknown): ScopeOption[] {
  const data = (value as { rows?: unknown[] } | unknown[]) || [];
  const rows = Array.isArray(data) ? data : data.rows || [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({ id: String(row.id), name: String(row.name || row.code || row.id), code: row.code ? String(row.code) : undefined }));
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>('clinic');
  const [clinic, setClinic] = useState<ClinicSettings>(INITIAL_CLINIC);
  const [modules, setModules] = useState<ClinicModuleStatus[]>([]);
  const [readinessByModule, setReadinessByModule] = useState<Record<string, ClinicModuleReadiness>>({});
  const [loading, setLoading] = useState(true);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [moduleError, setModuleError] = useState(false);
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);
  const [branches, setBranches] = useState<ScopeOption[]>([]);
  const [departments, setDepartments] = useState<ScopeOption[]>([]);
  const [scopeType, setScopeType] = useState<ScopedSettingsType>('branch');
  const [scopeId, setScopeId] = useState('');
  const [scopedEntries, setScopedEntries] = useState<ClinicConfigurationEntry[]>([]);
  const [scopedDraft, setScopedDraft] = useState<Record<string, unknown>>({});
  const [scopedOriginal, setScopedOriginal] = useState<Record<string, unknown>>({});
  const [scopedLoading, setScopedLoading] = useState(false);
  const [scopedSaving, setScopedSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.get('/clinic-settings');
        setClinic({ ...INITIAL_CLINIC, ...(response.data.data || response.data) });
      } catch {
        toast.error(t('settings.loadError'));
      } finally {
        setLoading(false);
      }

      try {
        const statuses = await clinicConfigurationApi.modules();
        setModules(statuses);
        try {
          const readiness = await clinicConfigurationApi.readiness();
          setReadinessByModule(Object.fromEntries(readiness.modules.map((item) => [item.moduleKey, item])));
        } catch {
          // The module status response remains a backwards-compatible fallback.
        }
      } catch {
        setModuleError(true);
      } finally {
        setModulesLoading(false);
      }
    };
    void load();
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    clinicConfigurationApi.scopes().then((response) => {
      if (cancelled) return;
      setBranches(scopeOptions(response.branches));
      setDepartments(scopeOptions(response.departments));
    }).catch(() => {
      if (!cancelled) toast.error(t('settings.scopedLoadError'));
    });
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    if (!scopeId) {
      setScopedEntries([]);
      setScopedDraft({});
      setScopedOriginal({});
      return;
    }
    let cancelled = false;
    setScopedLoading(true);
    clinicConfigurationApi.get(scopeType, scopeId).then((response) => {
      if (cancelled) return;
      const entries = response.entries.filter((entry) => entry.definition.allowedScopes.includes(scopeType));
      const values = Object.fromEntries(entries.map((entry) => [entry.key, serializeScopedValue(entry)]));
      setScopedEntries(entries);
      setScopedDraft(values);
      setScopedOriginal(values);
    }).catch(() => {
      if (!cancelled) toast.error(t('settings.scopedLoadError'));
    }).finally(() => {
      if (!cancelled) setScopedLoading(false);
    });
    return () => { cancelled = true; };
  }, [scopeId, scopeType, t]);

  const handleSaveScoped = async () => {
    if (!scopeId) return;
    setScopedSaving(true);
    try {
      for (const entry of scopedEntries) {
        const nextRaw = String(scopedDraft[entry.key] ?? '');
        const previousRaw = String(scopedOriginal[entry.key] ?? '');
        if (nextRaw === previousRaw) continue;
        let value: unknown = nextRaw;
        if (entry.definition.valueType === 'json') {
          value = JSON.parse(nextRaw || '[]');
        }
        await clinicConfigurationApi.update({
          scopeType,
          scopeId,
          key: entry.key,
          value,
          expectedVersion: entry.scopeType === scopeType && entry.scopeId === scopeId ? entry.version || undefined : undefined,
        });
      }
      toast.success(t('settings.scopedSaved'));
      const response = await clinicConfigurationApi.get(scopeType, scopeId);
      const entries = response.entries.filter((entry) => entry.definition.allowedScopes.includes(scopeType));
      const values = Object.fromEntries(entries.map((entry) => [entry.key, serializeScopedValue(entry)]));
      setScopedEntries(entries);
      setScopedDraft(values);
      setScopedOriginal(values);
    } catch {
      toast.error(t('settings.scopedSaveError'));
    } finally {
      setScopedSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/clinic-settings', clinic);
      toast.success(t('settings.saved'));
    } catch {
      toast.error(t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const focusConfigurationField = (key: string) => {
    setActiveTab('clinic');
    window.setTimeout(() => {
      const target = document.getElementById(CONFIGURATION_FIELD_IDS[key] || 'clinic-settings-clinic-information');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (target instanceof HTMLInputElement) target.focus();
    }, 0);
  };

  useEffect(() => {
    const focusKey = searchParams.get('focus');
    if (!focusKey || loading) return;
    focusConfigurationField(focusKey);
  }, [loading, searchParams]);

  const handleModuleToggle = async (module: ClinicModuleStatus) => {
    if (module.core || !module.entitled) return;
    const enabled = module.activationStatus !== 'enabled';
    setModuleSaving(module.moduleKey);
    try {
      const updated = await clinicConfigurationApi.setModuleEnabled(module.moduleKey, enabled);
      setModules((current) => current.map((item) => item.moduleKey === updated.moduleKey ? updated : item));
      toast.success(enabled ? t('settings.moduleEnabled') : t('settings.moduleDisabled'));
    } catch {
      toast.error(t('settings.moduleSaveError'));
    } finally {
      setModuleSaving(null);
    }
  };

  const navSections = [
    { titleKey: 'settings.profileSettings', descKey: 'settings.profileSettingsDesc', path: '/user-preferences', icon: UserCog },
    { titleKey: 'settings.appearance', descKey: 'settings.appearanceDesc', path: '/user-preferences', icon: Palette },
    { titleKey: 'settings.notifications', descKey: 'settings.notificationsDesc', path: '/notification-templates', icon: Bell },
    { titleKey: 'settings.regionalSettings', descKey: 'settings.regionalSettingsDesc', path: '/regions', icon: Globe },
    { titleKey: 'settings.printTemplates', descKey: 'settings.printTemplatesDesc', path: '/print-templates', icon: Printer },
    { titleKey: 'settings.security', descKey: 'settings.securityDesc', path: '/security', icon: Shield },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('settings.title')}</h1>

      <div className="flex gap-2 border-b border-[var(--border)] pb-2 overflow-x-auto">
        <button onClick={() => setActiveTab('clinic')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'clinic' ? 'bg-[var(--primary-soft)] text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
          <Building2 className="w-4 h-4 inline mr-2" />{t('settings.clinicInformation')}
        </button>
        <button onClick={() => setActiveTab('modules')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'modules' ? 'bg-[var(--primary-soft)] text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
          <Puzzle className="w-4 h-4 inline mr-2" />{t('settings.modules')}
        </button>
        <button onClick={() => setActiveTab('navigation')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'navigation' ? 'bg-[var(--primary-soft)] text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
          <UserCog className="w-4 h-4 inline mr-2" />{t('settings.quickNavigation')}
        </button>
      </div>

      {activeTab === 'clinic' && (
        <Card id="clinic-settings-clinic-information">
          <CardBody className="p-6">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('settings.basicInformation')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input id="clinic-settings-clinic-name" label={t('settings.clinicName')} value={clinic.clinicName} onChange={e => setClinic(p => ({ ...p, clinicName: e.target.value }))} />
                  <Input id="clinic-settings-legal-name" label={t('settings.legalName')} value={clinic.legalName} onChange={e => setClinic(p => ({ ...p, legalName: e.target.value }))} />
                  <Input id="clinic-settings-branch" label={t('settings.branch')} value={clinic.branch} onChange={e => setClinic(p => ({ ...p, branch: e.target.value }))} />
                  <Input id="clinic-settings-email" label={t('settings.email')} type="email" value={clinic.email} onChange={e => setClinic(p => ({ ...p, email: e.target.value }))} />
                  <Input id="clinic-settings-website" label={t('settings.website')} value={clinic.website} onChange={e => setClinic(p => ({ ...p, website: e.target.value }))} />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('settings.contactInformation')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input id="clinic-settings-land-phone" label={t('settings.landPhone')} value={clinic.landPhone} onChange={e => setClinic(p => ({ ...p, landPhone: e.target.value }))} placeholder="02-XXXXXXX" />
                  <Input id="clinic-settings-whatsapp-phone" label={t('settings.whatsappPhone')} value={clinic.whatsappPhone} onChange={e => setClinic(p => ({ ...p, whatsappPhone: e.target.value }))} placeholder="+20XXXXXXXXXX" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('settings.addressLocation')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><Input id="clinic-settings-address" label={t('settings.streetAddress')} value={clinic.address} onChange={e => setClinic(p => ({ ...p, address: e.target.value }))} /></div>
                  <Input id="clinic-settings-city" label={t('settings.city')} value={clinic.city} onChange={e => setClinic(p => ({ ...p, city: e.target.value }))} />
                  <Input id="clinic-settings-country" label={t('settings.country')} value={clinic.country} onChange={e => setClinic(p => ({ ...p, country: e.target.value }))} />
                  <div className="sm:col-span-2"><Input id="clinic-settings-maps-url" label={t('settings.mapsUrl')} value={clinic.googleMapsLocation} onChange={e => setClinic(p => ({ ...p, googleMapsLocation: e.target.value }))} placeholder="https://maps.google.com/..." /></div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('settings.branding')}</h3>
                <Input id="clinic-settings-logo-url" label={t('settings.logoUrl')} value={clinic.logoUrl} onChange={e => setClinic(p => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">{t('settings.workingHoursLegal')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input id="clinic-settings-working-hours" label={t('settings.workingHours')} value={clinic.workingHours} onChange={e => setClinic(p => ({ ...p, workingHours: e.target.value }))} />
                  <Input id="clinic-settings-license-number" label={t('settings.licenseNumber')} value={clinic.licenseNumber} onChange={e => setClinic(p => ({ ...p, licenseNumber: e.target.value }))} />
                  <Input id="clinic-settings-tax-number" label={t('settings.taxNumber')} value={clinic.taxNumber} onChange={e => setClinic(p => ({ ...p, taxNumber: e.target.value }))} />
                  <Input id="clinic-settings-currency" label={t('settings.currency')} value={clinic.currency} maxLength={3} onChange={e => setClinic(p => ({ ...p, currency: e.target.value.toUpperCase() }))} placeholder={DEFAULT_CLINIC_CURRENCY} />
                  <Input id="clinic-settings-timezone" label={t('settings.timezone')} value={clinic.timezone} onChange={e => setClinic(p => ({ ...p, timezone: e.target.value }))} placeholder="Area/City" />
                  <Input id="clinic-settings-locale" label={t('settings.locale')} value={clinic.locale} onChange={e => setClinic(p => ({ ...p, locale: e.target.value }))} placeholder="en" />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[var(--border)]">
                <Can permission="settings.manage">
                  <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>
                    {t('settings.saveClinicSettings')}
                  </Button>
                </Can>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'clinic' && (
        <Card>
          <CardBody className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.scopedOverrides')}</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{t('settings.scopedOverridesDescription')}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  id="clinic-settings-scope-type"
                  label={t('settings.scopeType')}
                  value={scopeType}
                  options={[
                    { value: 'branch', label: t('settings.branchScope') },
                    { value: 'department', label: t('settings.departmentScope') },
                  ]}
                  onChange={(event) => {
                    setScopeType(event.target.value as ScopedSettingsType);
                    setScopeId('');
                  }}
                />
                <Select
                  id="clinic-settings-scope-id"
                  label={t('settings.scopeTarget')}
                  value={scopeId}
                  placeholder={t('settings.selectScopeTarget')}
                  options={(scopeType === 'branch' ? branches : departments).map((option) => ({
                    value: option.id,
                    label: option.code ? `${option.name} (${option.code})` : option.name,
                  }))}
                  onChange={(event) => setScopeId(event.target.value)}
                />
              </div>
              {scopeId && scopedLoading && <div className="text-sm text-[var(--text-muted)]">{t('settings.loadingScopedSettings')}</div>}
              {scopeId && !scopedLoading && scopedEntries.length === 0 && (
                <div className="text-sm text-[var(--text-muted)]">{t('settings.noScopedSettings')}</div>
              )}
              {scopeId && !scopedLoading && scopedEntries.length > 0 && (
                <div className="space-y-4 border-t border-[var(--border)] pt-4">
                  {scopedEntries.map((entry) => {
                    const value = String(scopedDraft[entry.key] ?? '');
                    const label = t(`onboarding.fields.${entry.key}`);
                    return entry.definition.valueType === 'json' ? (
                      <div key={entry.key} className="space-y-1">
                        <label htmlFor={`scoped-${entry.key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                        <textarea
                          id={`scoped-${entry.key}`}
                          className="input min-h-28 font-mono text-xs"
                          value={value}
                          onChange={(event) => setScopedDraft((current) => ({ ...current, [entry.key]: event.target.value }))}
                        />
                        <p className="text-xs text-[var(--text-muted)]">{entry.definition.description}</p>
                      </div>
                    ) : (
                      <Input
                        key={entry.key}
                        id={`scoped-${entry.key}`}
                        label={label}
                        value={value}
                        onChange={(event) => setScopedDraft((current) => ({ ...current, [entry.key]: event.target.value }))}
                      />
                    );
                  })}
                  <div className="flex justify-end pt-2">
                    <Can permission="settings.manage">
                      <Button onClick={handleSaveScoped} loading={scopedSaving} icon={<Save className="w-4 h-4" />}>
                        {t('settings.saveScopedSettings')}
                      </Button>
                    </Can>
                  </div>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'modules' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="p-6">
              <div className="flex items-start gap-3">
                <Puzzle className="w-5 h-5 text-[var(--primary)] mt-0.5" />
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.modules')}</h2>
                  <p className="text-sm text-[var(--text-muted)] mt-1">{t('settings.modulesDescription')}</p>
                </div>
              </div>
            </CardBody>
          </Card>
          {moduleError && (
            <Card>
              <CardBody className="p-6 flex items-start gap-3 text-amber-800 bg-amber-50 rounded-lg">
                <AlertCircle className="w-5 h-5 mt-0.5" />
                <p className="text-sm">{t('settings.modulesUnavailable')}</p>
              </CardBody>
            </Card>
          )}
          {modulesLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modules.map((module) => {
                const enabled = module.activationStatus === 'enabled';
                const unavailable = !module.core && !module.entitled;
                const missingKeys = validationKeys(module, readinessByModule[module.moduleKey]);
                return (
                  <Card key={module.moduleKey}>
                    <CardBody className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-[var(--text-primary)]">{moduleLabel(module.moduleKey)}</h3>
                          <p className="text-sm text-[var(--text-muted)] mt-1">
                            {module.core ? t('settings.coreModule') : unavailable ? t('settings.moduleNotAvailable') : t('settings.optionalModule')}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-2">{t('settings.moduleStatus')}: {module.validationStatus}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${enabled ? 'text-green-700' : 'text-gray-500'}`}>
                          <CheckCircle2 className="w-4 h-4" />{enabled ? t('settings.enabled') : t('settings.disabled')}
                        </span>
                      </div>
                      {missingKeys.length > 0 && (
                        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-medium text-amber-900">{t('settings.missingConfiguration')}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {missingKeys.map((key) => {
                              const field = t(`settings.configurationField.${key}`, { defaultValue: key });
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => focusConfigurationField(key)}
                                  className="text-left text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950"
                                >
                                  {t('settings.configureField', { field })}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="mt-4">
                        {module.core ? (
                          <p className="text-xs text-gray-500">{t('settings.coreAlwaysEnabled')}</p>
                        ) : unavailable ? (
                          <p className="text-xs text-gray-500">{t('settings.contactSystemAdmin')}</p>
                        ) : (
                          <Can permission="settings.manage">
                            <Button size="sm" variant={enabled ? 'secondary' : 'primary'} onClick={() => void handleModuleToggle(module)} loading={moduleSaving === module.moduleKey} disabled={moduleSaving !== null}>
                              {enabled ? t('settings.disableModule') : t('settings.enableModule')}
                            </Button>
                          </Can>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'navigation' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {navSections.map((s) => (
            <Card key={s.path + s.titleKey} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(s.path)}>
              <CardBody className="p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-[var(--info-soft)] rounded-lg"><s.icon className="w-5 h-5 text-[var(--info)]" /></div>
                  <h3 className="font-semibold text-[var(--text-primary)]">{t(s.titleKey)}</h3>
                </div>
                <p className="text-sm text-[var(--text-muted)]">{t(s.descKey)}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
