const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

function isNonEmptyString(value, minLength = 1) {
  return typeof value === "string" && value.trim().length >= minLength;
}

function isOneOf(value, allowedList) {
  return allowedList.includes(value);
}

function toFiniteNumber(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : undefined;
}

function clampPagination(page, pageSize) {
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number.parseInt(pageSize, 10) || 10));
  return { page: safePage, pageSize: safePageSize };
}

module.exports = { isValidEmail, isNonEmptyString, isOneOf, toFiniteNumber, clampPagination };
