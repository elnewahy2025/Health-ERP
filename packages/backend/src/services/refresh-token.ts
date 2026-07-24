import crypto from 'crypto';
import { db } from '../core/database.js';
import { getEnv } from '@healthcare/shared/config';

const env = getEnv();

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function generateTokenPair(
  userId: string,
  tenantId: string,
  ipAddress?: string | null,
  userAgent?: string | null,
): Promise<TokenPair> {
  const refreshToken = generateToken();
  const tokenHash = hashToken(refreshToken);
  const family = crypto.randomUUID();

  await db('refresh_tokens').insert({
    tenant_id: tenantId,
    user_id: userId,
    token_hash: tokenHash,
    family,
    expires_at: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  });

  return { accessToken: '', refreshToken };
}

export async function rotateRefreshToken(
  oldToken: string,
  ipAddress?: string | null,
  userAgent?: string | null,
): Promise<TokenPair | null> {
  const oldHash = hashToken(oldToken);

  const existing = await db('refresh_tokens')
    .where({ token_hash: oldHash, is_revoked: false })
    .first();

  if (!existing) {
    // Token reuse detected — revoke entire family
    const revoked = await db('refresh_tokens')
      .where({ token_hash: oldHash })
      .first();
    if (revoked) {
      await db('refresh_tokens')
        .where({ family: revoked.family })
        .update({ is_revoked: true });
    }
    return null;
  }

  if (new Date(existing.expires_at) < new Date()) {
    await db('refresh_tokens')
      .where({ token_hash: oldHash })
      .update({ is_revoked: true });
    return null;
  }

  const newRefreshToken = generateToken();
  const newHash = hashToken(newRefreshToken);

  await db.transaction(async (trx) => {
    await trx('refresh_tokens')
      .where({ id: existing.id })
      .update({
        is_revoked: true,
        replaced_by_token_hash: newHash,
      });

    await trx('refresh_tokens').insert({
      tenant_id: existing.tenant_id,
      user_id: existing.user_id,
      token_hash: newHash,
      family: existing.family,
      expires_at: new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    });
  });

  return { accessToken: '', refreshToken: newRefreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db('refresh_tokens')
    .where({ token_hash: tokenHash })
    .update({ is_revoked: true });
}

export async function revokeAllUserTokens(userId: string, tenantId: string): Promise<void> {
  await db('refresh_tokens')
    .where({ user_id: userId, tenant_id: tenantId, is_revoked: false })
    .update({ is_revoked: true });
}
