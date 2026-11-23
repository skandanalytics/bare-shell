function parseOption(symbol) {
  const text = String(symbol || '').toUpperCase();
  const optionMatch = text.match(/\b(CE|PE)\b|(?:^|[^A-Z])(CE|PE)$/);
  const optionType = optionMatch && (optionMatch[1] || optionMatch[2]);
  if (!optionType) return null;

  const compactStrikeMatch = text.match(/(\d{5,7})(CE|PE)$/);
  if (compactStrikeMatch) {
    return { optionType, strike: normalizeStrike(Number(compactStrikeMatch[1])) };
  }

  const numbers = text.match(/\d+(?:\.\d+)?/g) || [];
  const strikes = numbers
    .map((value) => normalizeStrike(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 1000);
  if (!strikes.length) return null;
  const strike = strikes.reduce((best, value) => value > best ? value : best, 0);
  return { optionType, strike };
}

function normalizeStrike(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  if (Number.isInteger(number) && number >= 100000) {
    const tail = Number(String(number).slice(-5));
    if (tail >= 1000) return tail;
  }
  return number;
}

module.exports = {
  parseOption,
  normalizeStrike
};
