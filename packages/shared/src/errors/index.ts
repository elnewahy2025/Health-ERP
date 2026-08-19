export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      404,
      'NOT_FOUND',
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ProviderOperationNotSupportedError extends AppError {
  constructor(providerKey: string, operationKey: string) {
    super(
      `The ${providerKey} provider contract does not support this operation yet.`,
      409,
      'PROVIDER_OPERATION_NOT_SUPPORTED',
      { providerKey, operationKey },
    );
  }
}

export class TenantNotFoundError extends NotFoundError {
  constructor(slug?: string) {
    super('Tenant', slug);
  }
}

export class PatientNotFoundError extends NotFoundError {
  constructor(id?: string) {
    super('Patient', id);
  }
}

export class AppointmentNotFoundError extends NotFoundError {
  constructor(id?: string) {
    super('Appointment', id);
  }
}

export class SchedulingConflictError extends AppError {
  constructor(doctorId: string, date: string, time: string) {
    super(
      `Doctor ${doctorId} already has an appointment at ${date} ${time}`,
      409,
      'SCHEDULING_CONFLICT',
    );
  }
}

export class StatusTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(
      `Invalid status transition from '${from}' to '${to}'`,
      400,
      'INVALID_STATUS_TRANSITION',
    );
  }
}

export class WorkingHoursError extends AppError {
  constructor(time: string, opening: string, closing: string) {
    super(
      `Appointment time ${time} is outside working hours (${opening} - ${closing})`,
      400,
      'OUTSIDE_WORKING_HOURS',
    );
  }
}

export class CancellationPolicyError extends AppError {
  constructor(message: string) {
    super(message, 400, 'CANCELLATION_POLICY_VIOLATION');
  }
}
