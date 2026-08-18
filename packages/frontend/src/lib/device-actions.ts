export function normalizeDevicePhone(value: string): string {
  return value.replace(/[^0-9+]/g, '').replace(/^00/, '+');
}

export function buildWhatsAppDeviceLink(phone: string, message: string): string {
  const normalized = normalizeDevicePhone(phone).replace(/\+/g, '');
  return `whatsapp://send?phone=${encodeURIComponent(normalized)}&text=${encodeURIComponent(message)}`;
}

export function buildPhoneDeviceLink(phone: string): string {
  return `tel:${encodeURIComponent(normalizeDevicePhone(phone))}`;
}

export function confirmAndOpenDeviceLink(
  link: string,
  confirmationMessage: string,
  open: (target: string) => void = (target) => { window.location.href = target; },
): boolean {
  if (!window.confirm(confirmationMessage)) return false;
  open(link);
  return true;
}
