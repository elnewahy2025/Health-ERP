import {
  getClinicProviderContract,
  type ClinicProviderContract,
  type ProviderContractCapability,
  type ProviderContractCapabilityStatus,
} from './clinic-provider-contracts.js';

export type ProviderAdapterOperationKind = 'validation' | 'runtime' | 'callback';

export type ProviderAdapterOperationStatus = Extract<
  ProviderContractCapabilityStatus,
  'implemented' | 'not_implemented' | 'not_verified' | 'not_applicable'
>;

export interface ProviderAdapterOperationContract {
  operationKey: string;
  kind: ProviderAdapterOperationKind;
  capability: ProviderContractCapability;
  status: ProviderAdapterOperationStatus;
}

export interface ProviderAdapterContract {
  providerKey: string;
  contractVersion: number;
  supportedTestModes: ClinicProviderContract['supportedTestModes'];
  operations: readonly ProviderAdapterOperationContract[];
}

export interface ProviderAdapterExecutionContext {
  tenantId: string;
  requestId?: string;
  operationKey: string;
}

export interface ProviderAdapterExecutionResult {
  status: 'succeeded' | 'rejected' | 'failed' | 'unsupported';
  code: string;
  message: string;
}

export interface ProviderAdapterCallbackContext {
  tenantId?: string;
  requestId?: string;
  headers: Readonly<Record<string, string | undefined>>;
  rawBody?: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface ProviderAdapterCallbackResult {
  status: 'verified' | 'rejected' | 'failed' | 'unsupported';
  code: string;
  message: string;
  tenantId?: string;
  reference?: string;
}

function operationKind(capability: ProviderContractCapability): ProviderAdapterOperationKind {
  if (capability === 'structural_validation' || capability === 'endpoint_reachability') return 'validation';
  if (capability === 'vendor_authentication') return 'runtime';
  return 'runtime';
}

function buildOperations(contract: ClinicProviderContract): ProviderAdapterOperationContract[] {
  const operations = new Map<string, ProviderAdapterOperationContract>();

  for (const [capability, view] of Object.entries(contract.capabilities) as Array<[
    ProviderContractCapability,
    ClinicProviderContract['capabilities'][ProviderContractCapability],
  ]>) {
    for (const operationKey of view.operationKeys) {
      operations.set(operationKey, {
        operationKey,
        kind: operationKind(capability),
        capability,
        status: view.status,
      });
    }
  }

  for (const operationKey of contract.runtimeOperationKeys) {
    operations.set(operationKey, {
      operationKey,
      kind: operationKey.endsWith('.callback.verify') ? 'callback' : 'runtime',
      capability: 'business_operation',
      status: 'implemented',
    });
  }

  return [...operations.values()];
}

export function getProviderAdapterContract(providerKey: string): ProviderAdapterContract | null {
  const contract = getClinicProviderContract(providerKey);
  if (!contract) return null;
  return {
    providerKey: contract.providerKey,
    contractVersion: contract.contractVersion,
    supportedTestModes: contract.supportedTestModes,
    operations: buildOperations(contract),
  };
}

export function getProviderAdapterOperation(
  providerKey: string,
  operationKey: string,
): ProviderAdapterOperationContract | null {
  return getProviderAdapterContract(providerKey)?.operations.find((operation) => operation.operationKey === operationKey) || null;
}

export function isProviderAdapterOperationImplemented(providerKey: string, operationKey: string): boolean {
  return getProviderAdapterOperation(providerKey, operationKey)?.status === 'implemented';
}
