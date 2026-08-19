export type ProviderContractCapability =
  | 'structural_validation'
  | 'endpoint_reachability'
  | 'vendor_authentication'
  | 'business_operation';

export type ProviderContractCapabilityStatus = 'implemented' | 'not_implemented' | 'not_verified' | 'not_applicable';

export interface ProviderContractCapabilityView {
  status: ProviderContractCapabilityStatus;
  operationKeys: readonly string[];
}

export interface ClinicProviderContract {
  providerKey: string;
  contractVersion: number;
  supportedTestModes: readonly ('structural' | 'live')[];
  capabilities: Readonly<Record<ProviderContractCapability, ProviderContractCapabilityView>>;
  runtimeOperationKeys: readonly string[];
}

const structuralCapability = {
  status: 'implemented',
  operationKeys: ['provider.configuration.validate'],
} as const;

const endpointCapability = {
  status: 'implemented',
  operationKeys: ['provider.endpoint.reachability'],
} as const;

const unverifiedVendorAuthentication = {
  status: 'not_verified',
  operationKeys: ['provider.vendor.authenticate'],
} as const;

const fawryBusinessOperation = {
  status: 'implemented',
  operationKeys: ['fawry.payment.create', 'fawry.payment.callback.verify'],
} as const;

const stripeBusinessOperation = {
  status: 'implemented',
  operationKeys: ['stripe.checkout.create', 'stripe.payment.confirm', 'stripe.payment.callback.verify'],
} as const;

const twilioBusinessOperation = {
  status: 'implemented',
  operationKeys: ['twilio.sms.send', 'twilio.voice.call', 'twilio.voice.callback.verify'],
} as const;

export const CLINIC_PROVIDER_CONTRACTS: Readonly<Record<string, ClinicProviderContract>> = {
  eta: {
    providerKey: 'eta',
    contractVersion: 1,
    supportedTestModes: ['structural', 'live'],
    capabilities: {
      structural_validation: structuralCapability,
      endpoint_reachability: endpointCapability,
      vendor_authentication: unverifiedVendorAuthentication,
      business_operation: {
        status: 'implemented',
        operationKeys: ['eta.invoice.submit', 'eta.invoice.status'],
      },
    },
    runtimeOperationKeys: ['eta.invoice.submit', 'eta.invoice.status', 'eta.invoice.callback.verify'],
  },
  fawry: {
    providerKey: 'fawry',
    contractVersion: 1,
    supportedTestModes: ['structural', 'live'],
    capabilities: {
      structural_validation: structuralCapability,
      endpoint_reachability: endpointCapability,
      vendor_authentication: unverifiedVendorAuthentication,
      business_operation: fawryBusinessOperation,
    },
    runtimeOperationKeys: ['fawry.payment.create', 'fawry.payment.callback.verify'],
  },
  stripe: {
    providerKey: 'stripe',
    contractVersion: 1,
    supportedTestModes: ['structural', 'live'],
    capabilities: {
      structural_validation: structuralCapability,
      endpoint_reachability: endpointCapability,
      vendor_authentication: unverifiedVendorAuthentication,
      business_operation: stripeBusinessOperation,
    },
    runtimeOperationKeys: ['stripe.checkout.create', 'stripe.payment.confirm', 'stripe.payment.callback.verify'],
  },
  twilio: {
    providerKey: 'twilio',
    contractVersion: 1,
    supportedTestModes: ['structural', 'live'],
    capabilities: {
      structural_validation: structuralCapability,
      endpoint_reachability: endpointCapability,
      vendor_authentication: unverifiedVendorAuthentication,
      business_operation: twilioBusinessOperation,
    },
    runtimeOperationKeys: ['twilio.sms.send', 'twilio.voice.call', 'twilio.voice.callback.verify'],
  },
  instapay_manual: {
    providerKey: 'instapay_manual',
    contractVersion: 1,
    supportedTestModes: ['structural'],
    capabilities: {
      structural_validation: structuralCapability,
      endpoint_reachability: {
        status: 'not_applicable',
        operationKeys: [],
      },
      vendor_authentication: {
        status: 'not_applicable',
        operationKeys: [],
      },
      business_operation: {
        status: 'not_applicable',
        operationKeys: [],
      },
    },
    runtimeOperationKeys: [],
  },
};

export function getClinicProviderContract(providerKey: string): ClinicProviderContract | null {
  return CLINIC_PROVIDER_CONTRACTS[providerKey] || null;
}

export function getClinicProviderCapability(providerKey: string, capability: ProviderContractCapability): ProviderContractCapabilityView | null {
  return getClinicProviderContract(providerKey)?.capabilities[capability] || null;
}

export function isClinicProviderCapabilityImplemented(providerKey: string, capability: ProviderContractCapability): boolean {
  return getClinicProviderCapability(providerKey, capability)?.status === 'implemented';
}
