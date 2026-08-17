import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { renderWithProviders } from './test-utils';
import PatientsPage from '../pages/PatientsPage';
import { patientsApi } from '../lib/api';

vi.mock('../lib/api', () => ({
  patientsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'patient.new': 'New Patient',
        'patient.firstName': 'First Name',
        'patient.lastName': 'Last Name',
        'patient.dob': 'Date of Birth',
        'patient.gender': 'Gender',
        'patient.gender.male': 'Male',
        'patient.gender.female': 'Female',
        'patient.phone': 'Phone',
        'patient.email': 'Email',
        'patient.bloodType': 'Blood Type',
        'patient.nationalId': 'National ID',
        'patient.nationality': 'Nationality',
        'common.cancel': 'Cancel',
        'common.save': 'Save',
        'common.edit': 'Edit',
        'common.delete': 'Delete',
        'common.filter': 'Filter',
        'patients.title': 'Patients',
        'patients.search': 'Search patients...',
        'patients.loading': 'Loading...',
        'patients.noResults': 'No patients found',
      };
      return translations[key] || key;
    },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const mockPatients = [
  { id: '1', firstName: 'Ahmed', lastName: 'Hassan', phone: '01012345678', status: 'active' },
  { id: '2', firstName: 'Sara', lastName: 'Ali', phone: '01123456789', status: 'active' },
];

describe('PatientsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(patientsApi.list).mockResolvedValue({
      data: mockPatients,
      pagination: { total: 2, totalPages: 1 },
    });
  });


  it('renders patient list after data loads', async () => {
    renderWithProviders(<PatientsPage />);
    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });
    expect(screen.getByText('Hassan')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    expect(screen.getByText('Ali')).toBeInTheDocument();
  });

  it('calls patientsApi.list on mount', async () => {
    renderWithProviders(<PatientsPage />);
    await waitFor(() => {
      expect(patientsApi.list).toHaveBeenCalledWith({ page: 1, limit: 10, search: undefined });
    });
  });

  it('opens new patient modal when Add button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatientsPage />);

    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /New Patient/i });
    await user.click(addButton);

    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('Last Name')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
  });

  it('shows pagination when totalPages > 1', async () => {
    vi.mocked(patientsApi.list).mockResolvedValue({
      data: mockPatients,
      pagination: { total: 20, totalPages: 2 },
    });

    renderWithProviders(<PatientsPage />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });

  it('does not show pagination when totalPages is 1', async () => {
    renderWithProviders(<PatientsPage />);

    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
  });

  it('displays Edit and Delete buttons for each patient', async () => {
    renderWithProviders(<PatientsPage />);

    await waitFor(() => {
      expect(screen.getByText('Ahmed')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit');
    const deleteButtons = screen.getAllByText('Delete');
    expect(editButtons.length).toBe(2);
    expect(deleteButtons.length).toBe(2);
  });
});
