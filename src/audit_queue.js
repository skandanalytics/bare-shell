const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_QUEUED_ROWS = 1000;
const DEFAULT_RETRY_BATCH_SIZE = 50;

function createBoundedAuditQueue(options = {}) {
  const queuePath = options.queuePath ? path.resolve(options.queuePath) : '';
  const maxQueuedRows = clampPositiveInteger(options.maxQueuedRows, DEFAULT_MAX_QUEUED_ROWS);
  const retryBatchSize = clampPositiveInteger(options.retryBatchSize, DEFAULT_RETRY_BATCH_SIZE);
  return {
    path: queuePath,
    enqueue(row) {
      if (!queuePath) return false;
      appendBoundedJsonl(queuePath, row, maxQueuedRows);
      return true;
    },
    read(limit = retryBatchSize) {
      if (!queuePath || !fs.existsSync(queuePath)) return [];
      return readJsonl(queuePath).slice(0, clampPositiveInteger(limit, retryBatchSize));
    },
    replace(rows) {
      if (!queuePath) return false;
      const bounded = rows.slice(-maxQueuedRows);
      fs.mkdirSync(path.dirname(queuePath), { recursive: true });
      fs.writeFileSync(queuePath, bounded.map((row) => JSON.stringify(row)).join('\n') + (bounded.length ? '\n' : ''));
      return true;
    },
    flush(send) {
      if (!queuePath || typeof send !== 'function') return { attempted: 0, sent: 0, remaining: 0 };
      const rows = readJsonl(queuePath);
      if (!rows.length) return { attempted: 0, sent: 0, remaining: 0 };
      const batch = rows.slice(0, retryBatchSize);
      let sent = 0;
      for (const row of batch) {
        try {
          send(row);
          sent += 1;
        } catch (_error) {
          break;
        }
      }
      if (sent > 0) this.replace(rows.slice(sent));
      return { attempted: batch.length, sent, remaining: rows.length - sent };
    },
    size() {
      if (!queuePath || !fs.existsSync(queuePath)) return 0;
      return readJsonl(queuePath).length;
    }
  };
}

function writeAuditWithQueue(options = {}) {
  const row = options.row;
  const queue = options.queue;
  const send = options.send;
  if (!row || typeof send !== 'function') return { sent: false, queued: false };
  if (queue && typeof queue.flush === 'function') queue.flush(send);
  try {
    send(row);
    return { sent: true, queued: false };
  } catch (error) {
    if (queue && typeof queue.enqueue === 'function') {
      queue.enqueue(row);
      return { sent: false, queued: true, error };
    }
    return { sent: false, queued: false, error };
  }
}

function appendBoundedJsonl(filePath, row, maxRows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rows = readJsonl(filePath);
  rows.push(row);
  const bounded = rows.slice(-maxRows);
  fs.writeFileSync(filePath, bounded.map((item) => JSON.stringify(item)).join('\n') + '\n');
}

function readJsonl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function clampPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

module.exports = {
  createBoundedAuditQueue,
  writeAuditWithQueue
};
