import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Circle, Loader2, Settings2 } from 'lucide-react';
import { Card, CardBody } from '../ui';
import { clinicConfigurationApi, type ClinicModuleReadiness } from '../../lib/api';

const SETUP_FIELDS = [
  'clinic.profile.display_name',
  'clinic.profile.legal_name',
  'clinic.contact.email',
  'clinic.address.street',
  'clinic.timezone.default',
  'clinic.finance.currency',
] as const;

type ChecklistState = {
  modules: ClinicModuleReadiness[];
  loading: boolean;
  failed: boolean;
};

export function ClinicSetupChecklist() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<ChecklistState>({ modules: [], loading: true, failed: false });

  useEffect(() => {
    let cancelled = false;
    clinicConfigurationApi.readiness()
      .then((response) => {
        if (!cancelled) setState({ modules: response.modules, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ modules: [], loading: false, failed: true });
      });
    return () => { cancelled = true; };
  }, []);

  const missingKeys = useMemo(() => new Set(
    state.modules.flatMap((module) => module.missingRequiredKeys),
  ), [state.modules]);
  const missingFields = SETUP_FIELDS.filter((key) => missingKeys.has(key));
  const completedCount = SETUP_FIELDS.length - missingFields.length;

  if (state.loading) {
    return (
      <Card className="mb-6">
        <CardBody className="flex items-center gap-3 text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('onboarding.loading')}</span>
        </CardBody>
      </Card>
    );
  }

  if (state.failed) return null;

  return (
    <Card className="mb-6 border-primary-200 bg-primary-50/40">
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('onboarding.title')}</h2>
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{t('onboarding.description')}</p>
          </div>
          <span className="text-sm font-medium text-primary-700">
            {t('onboarding.progress', { completed: completedCount, total: SETUP_FIELDS.length })}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SETUP_FIELDS.map((key) => {
            const complete = !missingKeys.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => navigate(`/settings?focus=${encodeURIComponent(key)}`)}
                className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-primary-400 hover:bg-primary-50"
              >
                {complete ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {t(`onboarding.fields.${key}`)}
                  </span>
                  <span className={`mt-0.5 block text-xs ${complete ? 'text-green-700' : 'text-orange-700'}`}>
                    {complete ? t('onboarding.configured') : t('onboarding.configure')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {missingFields.length > 0 && (
          <div className="mt-4 flex items-start gap-2 text-xs text-orange-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('onboarding.incompleteNotice')}</span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default ClinicSetupChecklist;

