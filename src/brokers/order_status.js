const OPEN_STATUSES = new Set([
  'OPEN',
  'PENDING',
  'TRIGGER_PENDING',
  'TRIGGERPENDING',
  'MODIFY_PENDING',
  'MODIFYPENDING',
  'OPEN_PENDING',
  'OPENPENDING',
  'PUT_ORDER_REQ_RECEIVED',
  'PUTORDERREQRECEIVED',
  'AMO_REQ_RECEIVED',
  'AMOREQRECEIVED',
  'VALIDATION_PENDING',
  'VALIDATIONPENDING'
]);

const COMPLETE_STATUSES = new Set([
  'COMPLETE',
  'COMPLETED',
  'FILLED',
  'TRADED',
  'EXECUTED'
]);

const CANCELLED_STATUSES = new Set([
  'CANCELLED',
  'CANCELED',
  'CANCEL_REQUESTED',
  'CANCELREQUESTED'
]);

const REJECTED_STATUSES = new Set([
  'REJECTED',
  'RMS_REJECT',
  'RMSREJECT',
  'VALIDATION_REJECTED',
  'VALIDATIONREJECTED'
]);

const EXPIRED_STATUSES = new Set([
  'EXPIRED',
  'LAPSED'
]);

function normalizeOrderStatus(value) {
  const raw = rawOrderStatus(value);
  const key = statusKey(raw);
  const normalized = normalizedStatusForKey(key);
  return {
    raw,
    key,
    normalized,
    isOpen: normalized === 'open',
    isComplete: normalized === 'complete',
    isTerminal: ['complete', 'cancelled', 'rejected', 'expired'].includes(normalized),
    isRejected: normalized === 'rejected'
  };
}

function isOpenOrderStatus(value) {
  return normalizeOrderStatus(value).isOpen;
}

function isCompleteOrderStatus(value) {
  return normalizeOrderStatus(value).isComplete;
}

function rawOrderStatus(value) {
  if (!value) return '';
  if (typeof value !== 'object') return String(value || '').trim();
  return String(
    value.orderStatus
      || value.order_status
      || value.status
      || value.Status
      || value.state
      || value.orderState
      || value.order_state
      || ''
  ).trim();
}

function statusKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizedStatusForKey(key) {
  if (!key) return 'unknown';
  if (OPEN_STATUSES.has(key)) return 'open';
  if (COMPLETE_STATUSES.has(key)) return 'complete';
  if (CANCELLED_STATUSES.has(key)) return 'cancelled';
  if (REJECTED_STATUSES.has(key)) return 'rejected';
  if (EXPIRED_STATUSES.has(key)) return 'expired';
  return 'unknown';
}

module.exports = {
  isCompleteOrderStatus,
  isOpenOrderStatus,
  normalizeOrderStatus,
  rawOrderStatus,
  statusKey
};
