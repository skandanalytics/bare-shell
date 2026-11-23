function compareVersions(left, right) {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1;
    if ((a[index] || 0) < (b[index] || 0)) return -1;
  }
  return 0;
}

function normalizeVersion(value) {
  return String(value || '0')
    .split(/[.+-]/)
    .map((part) => {
      const match = String(part).match(/^\d+/);
      return match ? Number(match[0]) : 0;
    });
}

function checkAppCompatibility(target = {}, appVersion = '') {
  const current = String(appVersion || '').trim();
  const min = String(target.minAppVersion || '').trim();
  const max = String(target.maxAppVersion || '').trim();
  if (min && compareVersions(current, min) < 0) {
    return {
      ok: false,
      reason: `appVersion ${current || '0'} is below required ${min}`,
      minAppVersion: min,
      maxAppVersion: max
    };
  }
  if (max && compareVersions(current, max) > 0) {
    return {
      ok: false,
      reason: `appVersion ${current || '0'} is above supported ${max}`,
      minAppVersion: min,
      maxAppVersion: max
    };
  }
  return {
    ok: true,
    reason: '',
    minAppVersion: min,
    maxAppVersion: max
  };
}

module.exports = {
  compareVersions,
  checkAppCompatibility,
  normalizeVersion
};
