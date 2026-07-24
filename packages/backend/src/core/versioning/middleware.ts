import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  SUPPORTED_VERSIONS,
  CURRENT_VERSION,
  MINIMUM_VERSION,
  VERSION_HEADER,
  VERSION_RESPONSE_HEADER,
  DEPRECATION_HEADER,
  SUNSET_HEADER,
  VERSION_SUNSET,
} from './constants.js';

/**
 * Resolve the API version from the request using this priority:
 * 1. X-API-Version header
 * 2. Explicit /api/v{N}/ path prefix
 * 3. Default to CURRENT_VERSION
 */
function resolveVersion(request: FastifyRequest): string {
  // 1. Explicit header takes highest priority
  const headerVersion = request.headers[VERSION_HEADER.toLowerCase()];
  if (typeof headerVersion === 'string') {
    return normalizeVersion(headerVersion);
  }

  // 2. Path-based version: /api/v1/... → v1
  const url = request.url;
  const pathMatch = url.match(/^\/api\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1];
  }

  // 3. Default
  return CURRENT_VERSION;
}

/** Normalize a version string to 'vN' format */
function normalizeVersion(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

/** Check whether the version is in the supported list */
function isSupportedVersion(version: string): boolean {
  return (SUPPORTED_VERSIONS as readonly string[]).includes(version);
}

/** Compare two version strings (v1 < v2) */
function compareVersions(a: string, b: string): number {
  const numA = parseInt(a.replace('v', ''), 10);
  const numB = parseInt(b.replace('v', ''), 10);
  return numA - numB;
}

/**
 * Fastify onRequest hook that:
 * - Resolves the API version
 * - Rejects unsupported / too-old versions with 400
 * - Sets response headers for version and deprecation
 */
export async function apiVersioningHook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const version = resolveVersion(request);

  // Reject unsupported version
  if (!isSupportedVersion(version)) {
    reply.code(400).send({
      success: false,
      error: 'Unsupported API version',
      message: `API version '${version}' is not supported. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
      supported_versions: [...SUPPORTED_VERSIONS],
    });
    return;
  }

  // Reject version older than minimum
  if (compareVersions(version, MINIMUM_VERSION) < 0) {
    reply.code(400).send({
      success: false,
      error: 'Deprecated API version',
      message: `API version '${version}' is below the minimum supported version '${MINIMUM_VERSION}'. Please upgrade.`,
    });
    return;
  }

  // Set resolved version header on response
  reply.header(VERSION_RESPONSE_HEADER, version);

  // Check for sunset / deprecation
  const sunsetDate = VERSION_SUNSET[version];
  if (sunsetDate) {
    reply.header(DEPRECATION_HEADER, 'true');
    reply.header(SUNSET_HEADER, sunsetDate);
    reply.header('Link', `</api/${CURRENT_VERSION}/>; rel="successor-version"`);
  }

  // Store resolved version on request for downstream handlers
  (request as unknown as Record<string, unknown>).apiVersion = version;
}
