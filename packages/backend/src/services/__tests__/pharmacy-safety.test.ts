import { describe, expect, it } from 'vitest';
import {
  analyzePrescriptionSafety,
  findMedicationInteractions,
  safetyWarningsRequireOverride,
} from '../pharmacy-safety.js';

describe('pharmacy clinical safety', () => {
  it('blocks a prescription that conflicts with a recorded allergy', () => {
    const directWarnings = analyzePrescriptionSafety({
      drugName: 'Penicillin',
      medicationReference: { genericName: 'Penicillin', brandNames: null, interactions: null },
      patientAllergies: [{ allergen: 'Penicillin', severity: 'anaphylaxis', reaction: 'Anaphylaxis' }],
      activeMedications: [],
      existsInTenantCatalog: true,
    });
    expect(directWarnings[0]).toMatchObject({ code: 'ALLERGY_CONFLICT', severity: 'critical' });
    expect(safetyWarningsRequireOverride(directWarnings)).toBe(true);
  });

  it('detects duplicate therapy and unknown clinic drugs', () => {
    const warnings = analyzePrescriptionSafety({
      drugName: 'Warfarin',
      medicationReference: { genericName: 'Warfarin', brandNames: 'Coumadin', interactions: null },
      patientAllergies: [],
      activeMedications: [{ medicationName: 'Warfarin' }],
      existsInTenantCatalog: false,
    });
    expect(warnings.map((warning) => warning.code)).toEqual(['DRUG_NOT_IN_CATALOG', 'DUPLICATE_THERAPY']);
  });

  it('detects a documented interaction from reference data', () => {
    const interactions = findMedicationInteractions([
      { genericName: 'Warfarin', interactions: 'aspirin, ibuprofen' },
      { genericName: 'Aspirin', interactions: 'warfarin' },
    ]);
    expect(interactions).toHaveLength(1);
    expect(interactions[0]).toMatchObject({ drug1: 'Warfarin', drug2: 'Aspirin', severity: 'major' });
  });

  it('does not invent an interaction when reference data is absent', () => {
    expect(findMedicationInteractions([
      { genericName: 'Drug A', interactions: null },
      { genericName: 'Drug B', interactions: null },
    ])).toEqual([]);
  });
});
