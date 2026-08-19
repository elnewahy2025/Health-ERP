export type PharmacySafetySeverity = 'critical' | 'high' | 'moderate';

export interface PharmacySafetyWarning {
  code: 'ALLERGY_CONFLICT' | 'DUPLICATE_THERAPY' | 'DRUG_INTERACTION' | 'DRUG_NOT_IN_CATALOG';
  severity: PharmacySafetySeverity;
  drugName: string;
  relatedMedication?: string;
  message: string;
}

export interface MedicationReference {
  genericName: string | null;
  brandNames: string | null;
  interactions: string | null;
}

export interface PatientAllergyReference {
  allergen: string;
  severity?: string | null;
  reaction?: string | null;
}

export interface ActiveMedicationReference {
  medicationName: string;
  genericName?: string | null;
}

export interface PrescriptionSafetyInput {
  drugName: string;
  medicationReference?: MedicationReference | null;
  relatedMedicationReferences?: MedicationReference[];
  patientAllergies: PatientAllergyReference[];
  activeMedications: ActiveMedicationReference[];
  existsInTenantCatalog: boolean;
}

function normalize(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function splitTerms(value: string | null | undefined): string[] {
  return String(value || '')
    .split(/[,;|]/)
    .map((part) => normalize(part))
    .filter(Boolean);
}

function matchesName(value: string | null | undefined, candidates: string[]): boolean {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return false;
  return candidates.some((candidate) => candidate && (normalizedValue === candidate || normalizedValue.includes(candidate) || candidate.includes(normalizedValue)));
}

function referenceNames(drugName: string, reference?: MedicationReference | null): string[] {
  const names = [normalize(drugName), normalize(reference?.genericName)];
  names.push(...splitTerms(reference?.brandNames));
  return [...new Set(names.filter(Boolean))];
}

function addWarning(warnings: PharmacySafetyWarning[], warning: PharmacySafetyWarning): void {
  const duplicate = warnings.some((existing) => existing.code === warning.code && existing.relatedMedication === warning.relatedMedication);
  if (!duplicate) warnings.push(warning);
}

/**
 * Performs deterministic baseline checks using the clinic's recorded allergy,
 * active-medication, inventory, and medication-reference data. This is not a
 * replacement for a licensed clinical decision-support database; unknown or
 * ambiguous situations remain warnings that require an authorized override.
 */
export function analyzePrescriptionSafety(input: PrescriptionSafetyInput): PharmacySafetyWarning[] {
  const warnings: PharmacySafetyWarning[] = [];
  const names = referenceNames(input.drugName, input.medicationReference);

  if (!input.existsInTenantCatalog) {
    addWarning(warnings, {
      code: 'DRUG_NOT_IN_CATALOG',
      severity: 'high',
      drugName: input.drugName,
      message: `${input.drugName} is not present in this clinic's pharmacy catalog.`,
    });
  }

  for (const allergy of input.patientAllergies) {
    if (!matchesName(allergy.allergen, names)) continue;
    addWarning(warnings, {
      code: 'ALLERGY_CONFLICT',
      severity: 'critical',
      drugName: input.drugName,
      relatedMedication: allergy.allergen,
      message: `Recorded allergy to ${allergy.allergen} conflicts with ${input.drugName}.`,
    });
  }

  for (const active of input.activeMedications) {
    const activeNames = [normalize(active.medicationName), normalize(active.genericName)].filter(Boolean);
    if (activeNames.some((name) => names.includes(name))) {
      addWarning(warnings, {
        code: 'DUPLICATE_THERAPY',
        severity: 'high',
        drugName: input.drugName,
        relatedMedication: active.medicationName,
        message: `${input.drugName} duplicates active medication ${active.medicationName}.`,
      });
      continue;
    }

    const newReferenceTerms = splitTerms(input.medicationReference?.interactions);
    const activeReference = input.relatedMedicationReferences?.find((reference) =>
      matchesName(reference.genericName, activeNames) || splitTerms(reference.brandNames).some((brand) => activeNames.includes(brand)));
    const activeReferenceTerms = splitTerms(activeReference?.interactions);
    if (newReferenceTerms.some((term) => matchesName(active.medicationName, [term]) || activeNames.includes(term))
      || activeReferenceTerms.some((term) => names.includes(term) || matchesName(input.drugName, [term]))) {
      addWarning(warnings, {
        code: 'DRUG_INTERACTION',
        severity: 'high',
        drugName: input.drugName,
        relatedMedication: active.medicationName,
        message: `A documented interaction may exist between ${input.drugName} and ${active.medicationName}.`,
      });
    }
  }

  return warnings;
}

export interface MedicationInteractionReference {
  genericName: string;
  brandNames?: string | null;
  category?: string | null;
  interactions?: string | null;
}

export interface MedicationInteractionResult {
  drug1: string;
  drug2: string;
  severity: 'critical' | 'major' | 'moderate';
  description: string;
}

export function findMedicationInteractions(references: MedicationInteractionReference[]): MedicationInteractionResult[] {
  const results: MedicationInteractionResult[] = [];
  for (let i = 0; i < references.length; i += 1) {
    for (let j = i + 1; j < references.length; j += 1) {
      const first = references[i];
      const second = references[j];
      const firstNames = referenceNames(first.genericName, { genericName: first.genericName, brandNames: first.brandNames ?? null, interactions: first.interactions ?? null });
      const secondNames = referenceNames(second.genericName, { genericName: second.genericName, brandNames: second.brandNames ?? null, interactions: second.interactions ?? null });
      const firstInteractionTerms = splitTerms(first.interactions);
      const secondInteractionTerms = splitTerms(second.interactions);
      const linked = firstInteractionTerms.some((term) => secondNames.includes(term) || matchesName(second.genericName, [term]))
        || secondInteractionTerms.some((term) => firstNames.includes(term) || matchesName(first.genericName, [term]));
      if (linked) {
        results.push({
          drug1: first.genericName,
          drug2: second.genericName,
          severity: 'major',
          description: `${first.genericName} and ${second.genericName} have a documented interaction in the clinic medication reference.`
        });
      }
    }
  }
  return results;
}

export function safetyWarningsRequireOverride(warnings: PharmacySafetyWarning[]): boolean {
  return warnings.some((warning) => warning.severity === 'critical' || warning.severity === 'high');
}

export function normalizePharmacyName(value: string | null | undefined): string {
  return normalize(value);
}
