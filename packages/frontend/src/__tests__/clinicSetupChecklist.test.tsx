import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { renderWithProviders } from './test-utils';
import ClinicSetupChecklist from '../components/clinic/ClinicSetupChecklist';
import { clinicConfigurationApi } from '../lib/api';

vi.mock('../lib/api', () => ({
  clinicConfigurationApi: {
    readiness: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'onboarding.title': 'Complete clinic setup',
        'onboarding.description': 'Configure the clinic',
        'onboarding.loading': 'Checking clinic setup...',
        'onboarding.configured': 'Configured',
        'onboarding.configure': 'Configure in Settings',
        'onboarding.incompleteNotice': 'Setup is incomplete',
        'onboarding.fields.clinic.profile.display_name': 'Clinic name',
        'onboarding.fields.clinic.profile.legal_name': 'Legal name',
        'onboarding.fields.clinic.contact.email': 'Contact email',
        'onboarding.fields.clinic.address.street': 'Street address',
        'onboarding.fields.clinic.timezone.default': 'Timezone',
        'onboarding.fields.clinic.finance.currency': 'Currency',
      };
      if (key === 'onboarding.progress') return `${values?.completed} of ${values?.total} configured`;
      return labels[key] || key;
    },
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe('ClinicSetupChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clinicConfigurationApi.readiness).mockResolvedValue({
      tenantId: 'tenant-1',
      modules: [{
        moduleKey: 'core',
        core: true,
        entitled: true,
        activationStatus: 'enabled',
        validationStatus: 'incomplete',
        missingRequiredKeys: ['clinic.profile.display_name', 'clinic.finance.currency'],
      }],
    });
  });

  it('renders readiness progress from the centralized readiness response', async () => {
    renderWithProviders(<ClinicSetupChecklist />);

    await waitFor(() => expect(screen.getByText('13 of 15 configured')).toBeInTheDocument());
    expect(screen.getByText('Clinic name')).toBeInTheDocument();
    expect(screen.getAllByText('Configure in Settings')).toHaveLength(2);
    expect(screen.getAllByText('Configured')).toHaveLength(13);
  });

  it('links an incomplete field directly to its Settings focus target', async () => {
    const user = userEvent.setup();
    renderWithProviders(<><ClinicSetupChecklist /><LocationProbe /></>);

    await waitFor(() => expect(screen.getByText('Clinic name')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Clinic name/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/settings?focus=clinic.profile.display_name');
  });
});
