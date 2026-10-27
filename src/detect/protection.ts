type Fields = Record<string, unknown>;

// Containers and absent init are not evidence. Require an active flag or named scheme/key/license.
function declaration(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return !!value.trim() &&
    !/^(?:none|clear|false|0|off|disabled|unencrypted)$/i.test(value.trim());
  if (Array.isArray(value)) return value.some(declaration);
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Fields;
  return ['enabled', 'encrypted', 'scheme', 'schemeIdUri', 'method', 'system', 'key_system',
    'license_url', 'key_id', 'kid', 'pssh', 'widevine', 'playready', 'fairplay', 'clearkey']
    .some(key => declaration(entry[key]));
}

export function hasProtection(entry: Fields): boolean {
  return ['drm', 'content_protection', 'encryption', 'encrypted'].some(key => declaration(entry[key]));
}
