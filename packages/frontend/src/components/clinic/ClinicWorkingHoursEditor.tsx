import { useTranslation } from 'react-i18next';
import {
  CLINIC_WORKING_DAYS,
  parseClinicWorkingHours,
  validateClinicWorkingHours,
  type ClinicWorkingDay,
  type ClinicWorkingHoursInterval,
} from '@healthcare/shared/config/clinic-working-hours';

interface ClinicWorkingHoursEditorProps {
  value: unknown;
  onChange: (value: ClinicWorkingHoursInterval[]) => void;
  disabled?: boolean;
}

const DEFAULT_INTERVAL: ClinicWorkingHoursInterval = { day: 'mon', from: '09:00', to: '17:00' };

export function ClinicWorkingHoursEditor({ value, onChange, disabled = false }: ClinicWorkingHoursEditorProps) {
  const { t } = useTranslation();
  const intervals = parseClinicWorkingHours(value);
  const validationError = validateClinicWorkingHours(value)[0];

  const updateInterval = (index: number, patch: Partial<ClinicWorkingHoursInterval>) => {
    onChange(intervals.map((interval, currentIndex) => currentIndex === index ? { ...interval, ...patch } : interval));
  };

  const removeInterval = (index: number) => {
    onChange(intervals.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">{t('settings.workingHoursDescription')}</p>
        <button
          type="button"
          className="shrink-0 text-xs font-medium text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange([...intervals, { ...DEFAULT_INTERVAL }])}
          disabled={disabled}
        >
          {t('settings.addWorkingHours')}
        </button>
      </div>

      {intervals.length === 0 && (
        <p className="rounded-md border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
          {t('settings.workingHoursEmpty')}
        </p>
      )}

      {intervals.map((interval, index) => (
        <div key={`${index}-${interval.day}-${interval.from}-${interval.to}`} className="grid grid-cols-1 gap-2 rounded-md border border-[var(--border)] p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('settings.workingDay')}</span>
            <select
              className="input"
              value={interval.day}
              disabled={disabled}
              onChange={(event) => updateInterval(index, { day: event.target.value as ClinicWorkingDay })}
            >
              {CLINIC_WORKING_DAYS.map((day) => (
                <option key={day} value={day}>{t(`settings.workingDay.${day}`)}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('settings.opensAt')}</span>
            <input
              className="input"
              type="time"
              value={interval.from}
              disabled={disabled}
              onChange={(event) => updateInterval(index, { from: event.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('settings.closesAt')}</span>
            <input
              className="input"
              type="time"
              value={interval.to}
              disabled={disabled}
              onChange={(event) => updateInterval(index, { to: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => removeInterval(index)}
            disabled={disabled}
          >
            {t('settings.removeWorkingHours')}
          </button>
        </div>
      ))}

      {validationError && (
        <p className="text-xs text-red-600">
          {t(`settings.workingHoursError.${validationError.code}`)}
        </p>
      )}
    </div>
  );
}
