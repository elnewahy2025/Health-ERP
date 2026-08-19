import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserCog, Palette, Bell, Globe, Printer, Shield, Building2, Save, Loader2, Puzzle, Plug, KeyRound, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardBody, Input, Button, Select } from '../components/ui';
import { apiClient as api, clinicConfigurationApi, type ClinicModuleReadiness, type ClinicModuleStatus } from '../lib/api';
import { Can } from '../components/auth/Authorization';
import toast from 'react-hot-toast';
import { CLINIC_CONFIGURATION_REGISTRY, clinicConfigurationDefinition } from '@healthcare/shared/config/clinic-configuration';
import type { ClinicConfigurationEntry, ClinicConfigurationScope, ClinicProviderConfiguration, RegionalProfile } from '../lib/api/clinic-configuration';
import { isSupportedClinicLocale, isValidClinicTimezone } from '../lib/clinic-settings-validation';
import { ClinicWorkingHoursEditor } from '../components/clinic/ClinicWorkingHoursEditor';
import { parseClinicWorkingHours, validateClinicWorkingHours, type ClinicWorkingHoursInterval } from '@healthcare/shared/config/clinic-working-hours';

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

type SettingsTab = 'clinic' | 'integrations' | 'modules' | 'navigation';
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

function providerFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase())
    .trim();
}

function readinessClass(status: string): string {
  if (status === 'ready') return 'text-green-700 bg-green-50 border-green-200';
  if (status === 'invalid' || status === 'connection_failed') return 'text-red-700 bg-red-50 border-red-200';
  if (status === 'disabled') return 'text-gray-700 bg-gray-50 border-gray-200';
  return 'text-amber-800 bg-amber-50 border-amber-200';
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>('clinic');
  const [clinic, setClinic] = useState<ClinicSettings>(INITIAL_CLINIC);
  const [workingHoursDraft, setWorkingHoursDraft] = useState<ClinicWorkingHoursInterval[]>([]);
  const [modules, setModules] = useState<ClinicModuleStatus[]>([]);
  const [readinessByModule, setReadinessByModule] = useState<Record<string, ClinicModuleReadiness>>({});
  const [regionalProfile, setRegionalProfile] = useState<RegionalProfile | null>(null);
  const [providers, setProviders] = useState<ClinicProviderConfiguration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [integrationsError, setIntegrationsError] = useState(false);
  const [regionalSaving, setRegionalSaving] = useState(false);
  const [providerSaving, setProviderSaving] = useState<string | null>(null);
  const [providerTesting, setProviderTesting] = useState<string | null>(null);
  const [secretSaving, setSecretSaving] = useState<string | null>(null);
  const [providerConfigDraft, setProviderConfigDraft] = useState<Record<string, Record<string, unknown>>>({});
  const [providerEnvironmentDraft, setProviderEnvironmentDraft] = useState<Record<string, 'sandbox' | 'production'>>({});
  const [providerValidationDraft, setProviderValidationDraft] = useState<Record<string, { mode: 'structural' | 'live'; enabled: boolean; timeoutMs: number }>>({});
  const [providerSecretDraft, setProviderSecretDraft] = useState<Record<string, Record<string, string>>>({});
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
        const nextClinic = { ...INITIAL_CLINIC, ...(response.data.data || response.data) };
        setClinic(nextClinic);
        setWorkingHoursDraft(parseClinicWorkingHours(nextClinic.workingHours));
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

      try {
        const [profile, providerList] = await Promise.all([
          clinicConfigurationApi.regionalProfile(),
          clinicConfigurationApi.providers(),
        ]);
        setRegionalProfile(profile);
        setProviders(providerList);
        setProviderConfigDraft(Object.fromEntries(providerList.map((provider) => [
          provider.providerKey,
          provider.moduleConfiguration?.config || provider.connection?.config || {},
        ])));
        setProviderEnvironmentDraft(Object.fromEntries(providerList.map((provider) => [
          provider.providerKey,
          provider.connection?.environment || 'sandbox',
        ])));
        setProviderValidationDraft(Object.fromEntries(providerList.map((provider) => [
          provider.providerKey,
          {
            mode: provider.connection?.validationMode === 'live' ? 'live' : 'structural',
            enabled: provider.connection?.liveValidationEnabled || false,
            timeoutMs: provider.connection?.validationTimeoutMs || 5000,
          },
        ])));
      } catch {
        setIntegrationsError(true);
      } finally {
        setIntegrationsLoading(false);
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

  const handleResetScoped = async (entry: ClinicConfigurationEntry) => {
    if (!scopeId || entry.scopeType !== scopeType || entry.scopeId !== scopeId) return;
    setScopedSaving(true);
    try {
      await clinicConfigurationApi.remove({
        scopeType,
        scopeId,
        key: entry.key,
        expectedVersion: entry.version || undefined,
      });
      const response = await clinicConfigurationApi.get(scopeType, scopeId);
      const entries = response.entries.filter((current) => current.definition.allowedScopes.includes(scopeType));
      const values = Object.fromEntries(entries.map((current) => [current.key, serializeScopedValue(current)]));
      setScopedEntries(entries);
      setScopedDraft(values);
      setScopedOriginal(values);
      toast.success(t('settings.scopedReset'));
    } catch {
      toast.error(t('settings.scopedResetError'));
    } finally {
      setScopedSaving(false);
    }
  };

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
    if (!isValidClinicTimezone(clinic.timezone)) {
      toast.error(t('settings.invalidTimezone'));
      document.getElementById('clinic-settings-timezone')?.focus();
      return;
    }
    if (clinic.locale.trim() && !isSupportedClinicLocale(clinic.locale)) {
      toast.error(t('settings.invalidLocale'));
      document.getElementById('clinic-settings-locale')?.focus();
      return;
    }
    setSaving(true);
    try {
      const workingHoursErrors = validateClinicWorkingHours(workingHoursDraft);
      if (workingHoursErrors.length > 0) {
        toast.error(t(`settings.workingHoursError.${workingHoursErrors[0].code}`));
        return;
      }
      await api.put('/clinic-settings', { ...clinic, workingHours: JSON.stringify(workingHoursDraft) });
      setClinic((current) => ({ ...current, workingHours: JSON.stringify(workingHoursDraft) }));
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

  const handleSaveRegionalProfile = async () => {
    if (!regionalProfile) return;
    setRegionalSaving(true);
    try {
      const updated = await clinicConfigurationApi.updateRegionalProfile({
        countryCode: regionalProfile.countryCode,
        profileKey: regionalProfile.profileKey,
        status: regionalProfile.status as 'incomplete' | 'configured' | 'invalid',
        nationalIdentifierPolicy: regionalProfile.nationalIdentifierPolicy,
        phonePolicy: regionalProfile.phonePolicy,
        taxProfileKey: regionalProfile.taxProfileKey,
        metadata: regionalProfile.metadata,
        expectedVersion: regionalProfile.version || undefined,
      });
      setRegionalProfile(updated);
      toast.success(t('settings.regionalProfileSaved'));
    } catch {
      toast.error(t('settings.regionalProfileError'));
    } finally {
      setRegionalSaving(false);
    }
  };

  const replaceProvider = (updated: ClinicProviderConfiguration) => {
    setProviders((current) => current.map((item) => item.providerKey === updated.providerKey ? updated : item));
    setProviderConfigDraft((current) => ({ ...current, [updated.providerKey]: updated.moduleConfiguration?.config || updated.connection?.config || {} }));
    setProviderEnvironmentDraft((current) => ({ ...current, [updated.providerKey]: updated.connection?.environment || 'sandbox' }));
    setProviderValidationDraft((current) => ({
      ...current,
      [updated.providerKey]: {
        mode: updated.connection?.validationMode === 'live' ? 'live' : 'structural',
        enabled: updated.connection?.liveValidationEnabled || false,
        timeoutMs: updated.connection?.validationTimeoutMs || 5000,
      },
    }));
  };

  const handleSaveProvider = async (provider: ClinicProviderConfiguration) => {
    setProviderSaving(provider.providerKey);
    try {
      const updated = await clinicConfigurationApi.updateProvider(provider.providerKey, {
        displayName: provider.connection?.displayName || null,
        environment: providerEnvironmentDraft[provider.providerKey] || provider.connection?.environment || 'sandbox',
        config: providerConfigDraft[provider.providerKey] || {},
        expectedVersion: provider.connection?.version || undefined,
        expectedModuleVersion: provider.moduleConfiguration?.version || undefined,
        validationMode: providerValidationDraft[provider.providerKey]?.mode || (provider.connection?.validationMode === 'live' ? 'live' : 'structural'),
        liveValidationEnabled: providerValidationDraft[provider.providerKey]?.enabled || false,
        validationTimeoutMs: providerValidationDraft[provider.providerKey]?.timeoutMs || 5000,
      });
      replaceProvider(updated);
      toast.success(t('settings.providerSaved'));
    } catch {
      toast.error(t('settings.providerSaveError'));
    } finally {
      setProviderSaving(null);
    }
  };

  const handleTestProvider = async (provider: ClinicProviderConfiguration) => {
    setProviderTesting(provider.providerKey);
    try {
      const updated = await clinicConfigurationApi.testProvider(provider.providerKey);
      replaceProvider(updated);
      if (updated.readiness.status === 'ready') toast.success(t('settings.providerTested'));
      else toast.error(t('settings.providerTestError'));
    } catch {
      toast.error(t('settings.providerTestError'));
    } finally {
      setProviderTesting(null);
    }
  };

  const handleSaveSecret = async (provider: ClinicProviderConfiguration, secretKey: string) => {
    const value = providerSecretDraft[provider.providerKey]?.[secretKey]?.trim();
    if (!value) return;
    const mutationKey = `${provider.providerKey}:${secretKey}`;
    setSecretSaving(mutationKey);
    try {
      const updated = await clinicConfigurationApi.updateProviderSecret(provider.providerKey, secretKey, value, provider.connection?.version || undefined);
      replaceProvider(updated);
      setProviderSecretDraft((current) => ({
        ...current,
        [provider.providerKey]: { ...(current[provider.providerKey] || {}), [secretKey]: '' },
      }));
      toast.success(t('settings.secretSaved'));
    } catch {
      toast.error(t('settings.secretSaveError'));
    } finally {
      setSecretSaving(null);
    }
  };

  const handleRevokeSecret = async (provider: ClinicProviderConfiguration, secretKey: string) => {
    const mutationKey = `${provider.providerKey}:${secretKey}`;
    setSecretSaving(mutationKey);
    try {
      const updated = await clinicConfigurationApi.revokeProviderSecret(provider.providerKey, secretKey, provider.connection?.version || undefined);
      replaceProvider(updated);
      toast.success(t('settings.secretRevoked'));
    } catch {
      toast.error(t('settings.secretSaveError'));
    } finally {
      setSecretSaving(null);
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

  const timezoneInvalid = !isValidClinicTimezone(clinic.timezone);
  const localeInvalid = Boolean(clinic.locale.trim()) && !isSupportedClinicLocale(clinic.locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('settings.title')}</h1>

      <div className="flex gap-2 border-b border-[var(--border)] pb-2 overflow-x-auto">
        <button onClick={() => setActiveTab('clinic')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'clinic' ? 'bg-[var(--primary-soft)] text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
          <Building2 className="w-4 h-4 inline mr-2" />{t('settings.clinicInformation')}
        </button>
        <button onClick={() => setActiveTab('integrations')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === 'integrations' ? 'bg-[var(--primary-soft)] text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
          <Plug className="w-4 h-4 inline mr-2" />{t('settings.integrations')}
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
                  <Input id="clinic-settings-land-phone" label={t('settings.landPhone')} value={clinic.landPhone} onChange={e => setClinic(p => ({ ...p, landPhone: e.target.value }))} placeholder="Local landline format" />
                  <Input id="clinic-settings-whatsapp-phone" label={t('settings.whatsappPhone')} value={clinic.whatsappPhone} onChange={e => setClinic(p => ({ ...p, whatsappPhone: e.target.value }))} placeholder="+1234567890" />
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
                  <div id="clinic-settings-working-hours" className="space-y-1 sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.workingHours')}</label>
                    <ClinicWorkingHoursEditor value={workingHoursDraft} onChange={setWorkingHoursDraft} />
                  </div>
                  <Input id="clinic-settings-license-number" label={t('settings.licenseNumber')} value={clinic.licenseNumber} onChange={e => setClinic(p => ({ ...p, licenseNumber: e.target.value }))} />
                  <Input id="clinic-settings-tax-number" label={t('settings.taxNumber')} value={clinic.taxNumber} onChange={e => setClinic(p => ({ ...p, taxNumber: e.target.value }))} />
                  <Input id="clinic-settings-currency" label={t('settings.currency')} value={clinic.currency} maxLength={3} onChange={e => setClinic(p => ({ ...p, currency: e.target.value.toUpperCase() }))} placeholder={DEFAULT_CLINIC_CURRENCY} />
                  <Input id="clinic-settings-timezone" label={t('settings.timezone')} value={clinic.timezone} error={timezoneInvalid ? t('settings.invalidTimezone') : undefined} onChange={e => setClinic(p => ({ ...p, timezone: e.target.value }))} placeholder="Area/City" />
                  <Select
                    id="clinic-settings-locale"
                    label={t('settings.locale')}
                    value={clinic.locale}
                    error={localeInvalid ? t('settings.invalidLocale') : undefined}
                    options={[
                      { value: 'en', label: t('settings.localeEnglish') },
                      { value: 'ar', label: t('settings.localeArabic') },
                    ]}
                    onChange={e => setClinic(p => ({ ...p, locale: e.target.value }))}
                  />
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
                    const hasOverride = entry.scopeType === scopeType && entry.scopeId === scopeId;
                    const statusLabel = hasOverride ? t('settings.overrideSaved') : t('settings.inheritedValue');
                    const statusClass = hasOverride ? 'text-blue-700' : 'text-[var(--text-muted)]';
                    return entry.key === 'clinic.operations.working_hours' ? (
                      <div key={entry.key} className="space-y-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                        <ClinicWorkingHoursEditor
                          value={value}
                          onChange={(next) => setScopedDraft((current) => ({ ...current, [entry.key]: JSON.stringify(next) }))}
                          disabled={scopedSaving}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-[var(--text-muted)]">{entry.definition.description}</p>
                          <span className={`shrink-0 text-xs ${statusClass}`}>{statusLabel}</span>
                        </div>
                        {hasOverride && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void handleResetScoped(entry)}>{t('settings.resetToInherited')}</button>}
                      </div>
                    ) : entry.definition.valueType === 'json' ? (
                      <div key={entry.key} className="space-y-1">
                        <label htmlFor={`scoped-${entry.key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                        <textarea
                          id={`scoped-${entry.key}`}
                          className="input min-h-28 font-mono text-xs"
                          value={value}
                          onChange={(event) => setScopedDraft((current) => ({ ...current, [entry.key]: event.target.value }))}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-[var(--text-muted)]">{entry.definition.description}</p>
                          <span className={`shrink-0 text-xs ${statusClass}`}>{statusLabel}</span>
                        </div>
                        {hasOverride && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void handleResetScoped(entry)}>{t('settings.resetToInherited')}</button>}
                      </div>
                    ) : (
                      <div key={entry.key} className="space-y-1">
                        <Input
                          id={`scoped-${entry.key}`}
                          label={label}
                          value={value}
                          onChange={(event) => setScopedDraft((current) => ({ ...current, [entry.key]: event.target.value }))}
                          helpText={statusLabel}
                        />
                        {hasOverride && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void handleResetScoped(entry)}>{t('settings.resetToInherited')}</button>}
                      </div>
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

      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="p-6">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-[var(--primary)] mt-0.5" />
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.integrations')}</h2>
                  <p className="text-sm text-[var(--text-muted)] mt-1">{t('settings.integrationsDescription')}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {integrationsError && (
            <Card>
              <CardBody className="p-6 flex items-start gap-3 text-amber-800 bg-amber-50 rounded-lg">
                <AlertCircle className="w-5 h-5 mt-0.5" />
                <p className="text-sm">{t('settings.providerSaveError')}</p>
              </CardBody>
            </Card>
          )}

          {integrationsLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>
          ) : (
            <>
              {regionalProfile && (
                <Card>
                  <CardBody className="p-6 space-y-5">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.regionalProfile')}</h3>
                      <p className="text-sm text-[var(--text-muted)] mt-1">{t('settings.regionalProfileDescription')}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Input
                          label={t('settings.countryCode')}
                          value={regionalProfile.countryCode || ''}
                          maxLength={2}
                          onChange={(event) => setRegionalProfile((current) => current ? { ...current, countryCode: event.target.value.toUpperCase() } : current)}
                          helpText={t('settings.countryCodeHelp')}
                        />
                      </div>
                      <Input
                        label={t('settings.profileKey')}
                        value={regionalProfile.profileKey}
                        onChange={(event) => setRegionalProfile((current) => current ? { ...current, profileKey: event.target.value } : current)}
                      />
                      <Select
                        label={t('settings.nationalIdentifierPolicy')}
                        value={regionalProfile.nationalIdentifierPolicy}
                        options={[
                          { value: 'generic', label: t('settings.policyGeneric') },
                          { value: 'optional', label: t('settings.policyOptional') },
                          { value: 'required', label: t('settings.policyRequired') },
                          { value: 'strict', label: t('settings.policyStrict') },
                        ]}
                        onChange={(event) => setRegionalProfile((current) => current ? { ...current, nationalIdentifierPolicy: event.target.value } : current)}
                      />
                      <Select
                        label={t('settings.phonePolicy')}
                        value={regionalProfile.phonePolicy}
                        options={[
                          { value: 'international_or_local', label: t('settings.policyGeneric') },
                          { value: 'optional', label: t('settings.policyOptional') },
                          { value: 'required', label: t('settings.policyRequired') },
                          { value: 'strict', label: t('settings.policyStrict') },
                        ]}
                        onChange={(event) => setRegionalProfile((current) => current ? { ...current, phonePolicy: event.target.value } : current)}
                      />
                      <Input
                        label={t('settings.taxProfileKey')}
                        value={regionalProfile.taxProfileKey || ''}
                        onChange={(event) => setRegionalProfile((current) => current ? { ...current, taxProfileKey: event.target.value || null } : current)}
                      />
                      <Select
                        label={t('settings.providerStatus')}
                        value={regionalProfile.status}
                        options={[
                          { value: 'incomplete', label: t('settings.setupRequired') },
                          { value: 'configured', label: t('settings.ready') },
                          { value: 'invalid', label: t('settings.invalid') },
                        ]}
                        onChange={(event) => setRegionalProfile((current) => current ? { ...current, status: event.target.value } : current)}
                      />
                    </div>
                    <div className="flex justify-end pt-4 border-t border-[var(--border)]">
                      <Can permission="settings.manage">
                        <Button onClick={() => void handleSaveRegionalProfile()} loading={regionalSaving} icon={<Save className="w-4 h-4" />}>
                          {t('settings.saveRegionalProfile')}
                        </Button>
                      </Can>
                    </div>
                  </CardBody>
                </Card>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.providers')}</h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1">{t('settings.providersDescription')}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-2">{t('settings.providerValidationDescription')}</p>
                </div>
                {providers.map((provider) => {
                  const config = providerConfigDraft[provider.providerKey] || {};
                  const environment = providerEnvironmentDraft[provider.providerKey] || provider.connection?.environment || 'sandbox';
                  const validation = providerValidationDraft[provider.providerKey] || {
                    mode: provider.connection?.validationMode === 'live' ? 'live' as const : 'structural' as const,
                    enabled: provider.connection?.liveValidationEnabled || false,
                    timeoutMs: provider.connection?.validationTimeoutMs || 5000,
                  };
                  const readinessLabel = provider.readiness.status === 'ready'
                    ? t('settings.ready')
                    : provider.readiness.status === 'setup_required'
                      ? t('settings.setupRequired')
                      : provider.readiness.status === 'connection_failed'
                        ? t('settings.connectionFailed')
                        : provider.readiness.status === 'disabled'
                          ? t('settings.connectionDisabled')
                          : t('settings.invalid');
                  return (
                    <Card key={provider.providerKey}>
                      <CardBody className="p-6 space-y-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <KeyRound className="w-5 h-5 text-[var(--primary)]" />
                              <h4 className="text-lg font-semibold text-[var(--text-primary)]">{provider.displayName}</h4>
                            </div>
                            <p className="text-sm text-[var(--text-muted)] mt-1">{provider.providerKey}</p>
                            {provider.jurisdictionCode && <p className="text-xs text-[var(--text-muted)] mt-1">{t('settings.providerJurisdiction', { value: provider.jurisdictionCode })}</p>}
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${readinessClass(provider.readiness.status)}`}>
                            {provider.readiness.status === 'ready' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {readinessLabel}
                          </span>
                        </div>

                        {provider.contract && (
                          <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="font-medium text-[var(--text-primary)]">{t('settings.providerCapabilities')}</h5>
                              <span className="text-xs text-[var(--text-muted)]">{t('settings.contractVersion', { value: provider.contract.contractVersion })}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {Object.entries(provider.contract.capabilities).map(([capabilityKey, capability]) => {
                                const statusLabel = capability.status === 'implemented'
                                  ? t('settings.capabilityImplemented')
                                  : capability.status === 'not_verified'
                                    ? t('settings.capabilityNotVerified')
                                    : capability.status === 'not_implemented'
                                      ? t('settings.capabilityNotImplemented')
                                      : t('settings.capabilityNotApplicable');
                                const statusClass = capability.status === 'implemented' ? 'text-green-700' : 'text-amber-700';
                                return (
                                  <div key={capabilityKey} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-[var(--text-secondary)]">{providerFieldLabel(capabilityKey)}</span>
                                    <span className={statusClass}>{statusLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Select
                            label={t('settings.environment')}
                            value={environment}
                            options={[
                              { value: 'sandbox', label: t('settings.sandbox') },
                              { value: 'production', label: t('settings.production') },
                            ]}
                            onChange={(event) => setProviderEnvironmentDraft((current) => ({ ...current, [provider.providerKey]: event.target.value as 'sandbox' | 'production' }))}
                          />
                          <Select
                            label={t('settings.validationMode')}
                            value={validation.mode}
                            options={[
                              { value: 'structural', label: t('settings.structuralValidation') },
                              ...(provider.contract?.supportedTestModes.includes('live') ? [{ value: 'live' as const, label: t('settings.liveValidation') }] : []),
                            ]}
                            onChange={(event) => setProviderValidationDraft((current) => ({
                              ...current,
                              [provider.providerKey]: { ...validation, mode: event.target.value as 'structural' | 'live' },
                            }))}
                          />
                          <Input
                            type="number"
                            min={1000}
                            max={30000}
                            label={t('settings.validationTimeout')}
                            value={String(validation.timeoutMs)}
                            onChange={(event) => setProviderValidationDraft((current) => ({
                              ...current,
                              [provider.providerKey]: { ...validation, timeoutMs: Number(event.target.value) || 5000 },
                            }))}
                          />
                          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] self-end pb-2">
                            <input
                              type="checkbox"
                              checked={validation.enabled}
                              disabled={validation.mode !== 'live'}
                              onChange={(event) => setProviderValidationDraft((current) => ({
                                ...current,
                                [provider.providerKey]: { ...validation, enabled: event.target.checked },
                              }))}
                            />
                            {t('settings.enableLiveValidation')}
                          </label>
                          {provider.configKeys.map((key) => (
                            <Input
                              key={key}
                              label={providerFieldLabel(key)}
                              value={String(config[key] ?? '')}
                              onChange={(event) => setProviderConfigDraft((current) => ({
                                ...current,
                                [provider.providerKey]: { ...(current[provider.providerKey] || {}), [key]: event.target.value },
                              }))}
                            />
                          ))}
                        </div>
                        {provider.configKeys.length === 0 && <p className="text-sm text-[var(--text-muted)]">{t('settings.providerNoConfig')}</p>}

                        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
                          <Can permission="settings.manage">
                            <Button size="sm" onClick={() => void handleSaveProvider(provider)} loading={providerSaving === provider.providerKey} icon={<Save className="w-4 h-4" />}>
                              {t('settings.saveProvider')}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => void handleTestProvider(provider)} loading={providerTesting === provider.providerKey} icon={<RefreshCw className="w-4 h-4" />}>
                              {providerTesting === provider.providerKey ? t('settings.testingProvider') : t('settings.testProvider')}
                            </Button>
                          </Can>
                        </div>

                        <div className="border-t border-[var(--border)] pt-4 space-y-3">
                          <div>
                            <h5 className="font-medium text-[var(--text-primary)]">{t('settings.providerSecrets')}</h5>
                            <p className="text-xs text-[var(--text-muted)] mt-1">{t('settings.providerNoSecrets')}</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {Object.entries(provider.secrets).map(([secretKey, metadata]) => {
                              const mutationKey = `${provider.providerKey}:${secretKey}`;
                              return (
                                <div key={secretKey} className="rounded-lg border border-[var(--border)] p-3 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-[var(--text-primary)]">{providerFieldLabel(secretKey)}</span>
                                    <span className={`text-xs ${metadata.configured ? 'text-green-700' : 'text-[var(--text-muted)]'}`}>
                                      {metadata.configured ? t('settings.secretConfigured') : t('settings.secretNotConfigured')}
                                    </span>
                                  </div>
                                  {metadata.lastFour && <p className="text-xs text-[var(--text-muted)]">{t('settings.lastFour', { value: metadata.lastFour })}</p>}
                                  <Input
                                    type="password"
                                    label={t('settings.secretValue')}
                                    value={providerSecretDraft[provider.providerKey]?.[secretKey] || ''}
                                    onChange={(event) => setProviderSecretDraft((current) => ({
                                      ...current,
                                      [provider.providerKey]: { ...(current[provider.providerKey] || {}), [secretKey]: event.target.value },
                                    }))}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Can permission="settings.manage">
                                      <Button size="sm" onClick={() => void handleSaveSecret(provider, secretKey)} loading={secretSaving === mutationKey}>
                                        {t('settings.saveSecret')}
                                      </Button>
                                      {metadata.configured && <Button size="sm" variant="secondary" onClick={() => void handleRevokeSecret(provider, secretKey)} loading={secretSaving === mutationKey}>
                                        {t('settings.revokeSecret')}
                                      </Button>}
                                    </Can>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {(provider.readiness.missing.length > 0 || provider.readiness.errors.length > 0) && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs font-medium text-amber-900">{t('settings.readiness')}</p>
                            {provider.readiness.missing.length > 0 && <p className="text-xs text-amber-800 mt-1">{t('settings.missing')}: {provider.readiness.missing.join(', ')}</p>}
                            {provider.readiness.errors.length > 0 && <p className="text-xs text-red-700 mt-1">{provider.readiness.errors.join(', ')}</p>}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
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
