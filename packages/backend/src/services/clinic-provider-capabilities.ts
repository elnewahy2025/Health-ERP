import { ProviderOperationNotSupportedError } from '@healthcare/shared/errors';
import { getClinicProviderContract } from './clinic-provider-contracts.js';

export function hasClinicProviderOperation(providerKey: string, operationKey: string): boolean {
  const contract = getClinicProviderContract(providerKey);
  if (!contract) return false;
  if (contract.runtimeOperationKeys.includes(operationKey)) return true;
  return Object.values(contract.capabilities).some((capability) => (
    capability.status === 'implemented' && capability.operationKeys.includes(operationKey)
  ));
}

export function assertClinicProviderOperation(providerKey: string, operationKey: string): void {
  if (!hasClinicProviderOperation(providerKey, operationKey)) {
    throw new ProviderOperationNotSupportedError(providerKey, operationKey);
  }
}
