import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const APP_NAME = 'Clinic Management System';

export function generateSecret(): { secret: string; otpauthUrl: string } {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri('user', APP_NAME, secret);
  return { secret, otpauthUrl };
}

export function verifyToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export async function generateQrCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}
