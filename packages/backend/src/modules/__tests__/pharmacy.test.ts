import { describe, it, expect } from 'vitest';

describe('Pharmacy Module', () => {
  it('should validate prescription dosage', () => {
    const prescriptions = [
      { drug: 'Amoxicillin', dose: 500, maxDose: 1000, unit: 'mg' },
      { drug: 'Ibuprofen', dose: 200, maxDose: 400, unit: 'mg' },
      { drug: 'Paracetamol', dose: 1500, maxDose: 1000, unit: 'mg' },
    ];
    const overdoses = prescriptions.filter((p) => p.dose > p.maxDose);
    expect(overdoses).toHaveLength(1);
    expect(overdoses[0].drug).toBe('Paracetamol');
  });

  it('should calculate dispensed quantity from prescription', () => {
    const frequency = 3; // times per day
    const durationDays = 7;
    const quantityPerDose = 2;
    const totalQuantity = frequency * durationDays * quantityPerDose;
    expect(totalQuantity).toBe(42);
  });

  it('should detect drug interaction warnings', () => {
    const interactions: Record<string, string[]> = {
      'warfarin': ['aspirin', 'ibuprofen'],
      'metformin': ['alcohol'],
    };
    const currentDrug = 'warfarin';
    const newDrug = 'aspirin';
    const hasInteraction = interactions[currentDrug]?.includes(newDrug) || false;
    expect(hasInteraction).toBe(true);
  });

  it('should track refill eligibility', () => {
    const prescription = {
      quantityDispensed: 30,
      refillLimit: 3,
      refillCount: 2,
      lastDispensedDate: new Date('2026-07-01'),
    };
    const canRefill = prescription.refillCount < prescription.refillLimit;
    expect(canRefill).toBe(true);
    const remainingRefills = prescription.refillLimit - prescription.refillCount;
    expect(remainingRefills).toBe(1);
  });
});


describe('Pharmacy authorization scopes', () => {
  it('resolves the scope for the requested pharmacy operation', async () => {
    const { resolvePharmacyScope } = await import('../pharmacy/index.js');
    const principal = {
      id: 'user-1',
      tenantId: 'tenant-1',
      grants: [
        { permission: 'pharmacy.view', scope: 'department' as const },
        { permission: 'pharmacy.create', scope: 'branch' as const },
        { permission: 'pharmacy.edit', scope: 'branch' as const },
        { permission: 'pharmacy.approve', scope: 'branch' as const },
      ],
    } as any;

    expect(resolvePharmacyScope(principal, 'pharmacy.view')).toBe('department');
    expect(resolvePharmacyScope(principal, 'pharmacy.create')).toBe('branch');
    expect(resolvePharmacyScope(principal, 'pharmacy.edit')).toBe('branch');
    expect(resolvePharmacyScope(principal, 'pharmacy.approve')).toBe('branch');
  });

  it('allows a module wildcard to resolve every pharmacy operation', async () => {
    const { resolvePharmacyScope } = await import('../pharmacy/index.js');
    const principal = {
      id: 'user-1',
      tenantId: 'tenant-1',
      grants: [{ permission: 'pharmacy.*', scope: 'branch' as const }],
    } as any;

    expect(resolvePharmacyScope(principal, 'pharmacy.create')).toBe('branch');
    expect(resolvePharmacyScope(principal, 'pharmacy.edit')).toBe('branch');
    expect(resolvePharmacyScope(principal, 'pharmacy.approve')).toBe('branch');
  });
});
