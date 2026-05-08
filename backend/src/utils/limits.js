export function getPositiveIntFromEnv(key) {
  const rawValue = process.env[key];
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function getNonNegativeIntFromEnv(key) {
  const rawValue = process.env[key];
  if (rawValue == null || rawValue === '') {
    return null;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}
