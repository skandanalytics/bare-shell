const { createBrokerAdapter, normalizeBrokerId } = require('./broker_registry');

const SUMMARY_FIELDS = ['clientId', 'clientName', 'accountStatus', 'balance', 'marginUsed', 'dayPnl', 'positions'];

function analyzeDiscoveryRows(options = {}) {
  const brokerId = normalizeBrokerId(options.brokerId);
  const adapter = options.adapter || createBrokerAdapter(brokerId, { config: options.config || {} });
  const rows = Array.isArray(options.rows) ? options.rows : [];
  const result = {
    broker: brokerId,
    totalRows: rows.length,
    mappedRows: 0,
    unmappedRows: 0,
    fields: emptyFieldCoverage(),
    samples: [],
    gaps: []
  };

  for (const row of rows) {
    const summary = adapter.mapDiscoveryAccountSummary(row);
    if (!summary) {
      result.unmappedRows += 1;
      if (result.samples.length < 10) {
        result.samples.push(sampleRow(row, null));
      }
      continue;
    }

    result.mappedRows += 1;
    updateFieldCoverage(result.fields, summary);
    if (result.samples.length < 10) {
      result.samples.push(sampleRow(row, summary));
    }
  }

  result.gaps = fieldGaps(result.fields);
  return result;
}

function emptyFieldCoverage() {
  return SUMMARY_FIELDS.reduce((fields, field) => {
    fields[field] = 0;
    return fields;
  }, {});
}

function updateFieldCoverage(fields, summary = {}) {
  for (const field of SUMMARY_FIELDS) {
    const value = summary[field];
    if (field === 'positions') {
      if (Array.isArray(value) && value.length) fields[field] += 1;
    } else if (value != null && value !== '') {
      fields[field] += 1;
    }
  }
}

function fieldGaps(fields = {}) {
  return Object.entries(fields)
    .filter(([, count]) => !count)
    .map(([field]) => field);
}

function sampleRow(row = {}, summary) {
  return {
    url: row.url || '',
    status: row.status || '',
    mapped: Boolean(summary),
    fields: summary ? mappedFieldNames(summary) : []
  };
}

function mappedFieldNames(summary = {}) {
  return SUMMARY_FIELDS.filter((field) => {
    const value = summary[field];
    if (field === 'positions') return Array.isArray(value) && value.length;
    return value != null && value !== '';
  });
}

module.exports = {
  analyzeDiscoveryRows,
  fieldGaps,
  mappedFieldNames
};
