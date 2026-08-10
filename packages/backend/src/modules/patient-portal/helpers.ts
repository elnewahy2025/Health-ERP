/**
 * Patient portal input helpers — re-exported from the shared package so the
 * backend and frontend always use the same normalization/validation rules.
 */
export {
  normalizePortalPhone,
  isValidPortalPhone,
  isValidNationalId,
  waMeLink,
} from '@healthcare/shared/utils';
