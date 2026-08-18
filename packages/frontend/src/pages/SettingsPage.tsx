import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { UserCog, Palette, Bell, Globe, Printer, Shield, Building2, Save, Loader2, Puzzle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardBody, Input, Button } from '../components/ui';
import { apiClient as api, clinicConfigurationApi, type ClinicModuleReadiness, type ClinicModuleStatus } from '../lib/api';
import { Can } from '../components/auth/Authorization';
import toast from 'react-hot-toast';

interface ClinicSettings {
  clinicName: string;
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
  twilioConfigured?: boolean;
}

type SettingsTab = 'clinic' | 'modules' | 'navigation';

const INITIAL_CLINIC: ClinicSettings = {
  clinicName: '', branch: '', landPhone: '', whatsappPhone: '', logoUrl: '',
  address: '', city: '', country: '', googleMapsLocation: '', email: '',
  website: '', workingHours: 'Sun-Thu: 9AM-5PM', licenseNumber: '', taxNumber: '',
};

function moduleLabel(moduleKey: string): string {
  return moduleKey
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const CONFIGURATION_FIELD_IDS: Record<string, string> = {
  'clinic.profile.display_name': 'clinic-settings-clinic-name',
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
};

function validationKeys(module: ClinicModuleStatus, readiness?: ClinicModuleReadiness): string[] {
  if (readiness) return readiness.missingRequiredKeys;
  return Array.isArray(module.validationErrors)
    ? module.validationErrors.filter((key): key is string => typeof key === 'string')
    : [];
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SettingsTab>('clinic');
  const [clinic, setClinic] = useState<ClinicSettings>(INITIAL_CLINIC);
  const [modules, setModules] = useState<ClinicModuleStatus[]>([]);
  const [readinessByModule, setReadinessByModule] = useState<Record<string, ClinicModuleReadiness>>({});
  const [loading, setLoading] = useState(true);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [moduleError, setModuleError] = useState(false);
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);

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
