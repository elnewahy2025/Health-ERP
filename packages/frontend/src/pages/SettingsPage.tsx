import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { UserCog, Palette, Bell, Globe, Printer, Shield, Building2, Save, Loader2 } from 'lucide-react';
import { Card, CardBody, Input, Button } from '../components/ui';
import { apiClient as api } from '../lib/api';
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
}

const INITIAL_CLINIC: ClinicSettings = {
  clinicName: '', branch: '', landPhone: '', whatsappPhone: '', logoUrl: '',
  address: '', city: '', country: '', googleMapsLocation: '', email: '',
  website: '', workingHours: 'Sun-Thu: 9AM-5PM', licenseNumber: '', taxNumber: '',
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'clinic' | 'navigation'>('clinic');
  const [clinic, setClinic] = useState<ClinicSettings>(INITIAL_CLINIC);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/clinic-settings').then(r => {
      setClinic(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/clinic-settings', clinic);
      toast.success('Clinic settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
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

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-[var(--border)] pb-2">
        <button onClick={() => setActiveTab('clinic')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'clinic' ? 'bg-[var(--primary-soft)] text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
          <Building2 className="w-4 h-4 inline mr-2" />Clinic Information
        </button>
        <button onClick={() => setActiveTab('navigation')} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'navigation' ? 'bg-[var(--primary-soft)] text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
          <UserCog className="w-4 h-4 inline mr-2" />Quick Navigation
        </button>
      </div>

      {activeTab === 'clinic' && (
        <Card>
          <CardBody className="p-6">
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Clinic Name" value={clinic.clinicName} onChange={e => setClinic(p => ({ ...p, clinicName: e.target.value }))} />
                  <Input label="Branch" value={clinic.branch} onChange={e => setClinic(p => ({ ...p, branch: e.target.value }))} />
                  <Input label="Email" type="email" value={clinic.email} onChange={e => setClinic(p => ({ ...p, email: e.target.value }))} />
                  <Input label="Website" value={clinic.website} onChange={e => setClinic(p => ({ ...p, website: e.target.value }))} />
                </div>
              </div>

              {/* Contact */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Contact Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Land Phone" value={clinic.landPhone} onChange={e => setClinic(p => ({ ...p, landPhone: e.target.value }))} placeholder="02-XXXXXXX" />
                  <Input label="WhatsApp Phone" value={clinic.whatsappPhone} onChange={e => setClinic(p => ({ ...p, whatsappPhone: e.target.value }))} placeholder="+20XXXXXXXXXX" />
                </div>
              </div>

              {/* Address */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Address & Location</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Input label="Street Address" value={clinic.address} onChange={e => setClinic(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <Input label="City" value={clinic.city} onChange={e => setClinic(p => ({ ...p, city: e.target.value }))} />
                  <Input label="Country" value={clinic.country} onChange={e => setClinic(p => ({ ...p, country: e.target.value }))} />
                  <div className="sm:col-span-2">
                    <Input label="Google Maps Location URL" value={clinic.googleMapsLocation} onChange={e => setClinic(p => ({ ...p, googleMapsLocation: e.target.value }))} placeholder="https://maps.google.com/..." />
                  </div>
                </div>
              </div>

              {/* Logo */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Logo</h3>
                <Input label="Logo URL" value={clinic.logoUrl} onChange={e => setClinic(p => ({ ...p, logoUrl: e.target.value }))} placeholder="https://..." />
              </div>

              {/* Hours & Legal */}
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Working Hours & Legal</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Working Hours" value={clinic.workingHours} onChange={e => setClinic(p => ({ ...p, workingHours: e.target.value }))} />
                  <Input label="License Number" value={clinic.licenseNumber} onChange={e => setClinic(p => ({ ...p, licenseNumber: e.target.value }))} />
                  <Input label="Tax Number" value={clinic.taxNumber} onChange={e => setClinic(p => ({ ...p, taxNumber: e.target.value }))} />
                </div>
              </div>

              {/* Save */}
              <div className="flex justify-end pt-4 border-t border-[var(--border)]">
                <Button onClick={handleSave} loading={saving} icon={<Save className="w-4 h-4" />}>
                  Save Clinic Settings
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'navigation' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {navSections.map((s) => (
            <Card key={s.path + s.titleKey} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(s.path)}>
              <CardBody className="p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-[var(--info-soft)] rounded-lg">
                    <s.icon className="w-5 h-5 text-[var(--info)]" />
                  </div>
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
