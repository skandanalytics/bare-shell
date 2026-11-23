const fs = require('fs');
const path = require('path');

class CandleEngine {
  constructor({ dataDir, symbol, token, intervalMs = 60_000, maxCandles = 160 }) {
    this.dataDir = dataDir;
    this.symbol = symbol || `Token ${token}`;
    this.token = String(token);
    this.intervalMs = intervalMs;
    this.maxCandles = maxCandles;
    this.current = null;
    this.closedCandles = [];
    fs.mkdirSync(this.candleDir(), { recursive: true });
  }

  candleDir() {
    return path.join(this.dataDir, 'market_candles', safePathPart(`${this.symbol}_${this.token}`));
  }

  addTick(tick) {
    const ts = Number(tick.ts || Date.now());
    const price = Number(tick.lp || tick.price);
    if (!Number.isFinite(price)) return { current: this.current, closed: null };

    const bucket = Math.floor(ts / this.intervalMs) * this.intervalMs;
    let closed = null;

    if (!this.current || this.current.bucket !== bucket) {
      if (this.current) {
        closed = this.finalize(this.current);
        if (closed) {
          this.closedCandles.push(closed);
          if (this.closedCandles.length > this.maxCandles) {
            this.closedCandles.splice(0, this.closedCandles.length - this.maxCandles);
          }
          this.persist(closed);
        }
      }
      this.current = this.createCandle(bucket, price, ts);
    } else {
      this.updateCandle(this.current, price, ts);
    }

    return {
      current: this.decorate(this.current),
      closed
    };
  }

  createCandle(bucket, price, ts) {
    return {
      symbol: this.symbol,
      token: this.token,
      bucket,
      startTime: new Date(bucket).toISOString(),
      open: price,
      high: price,
      low: price,
      close: price,
      firstTickTs: ts,
      lastTickTs: ts,
      tickCount: 1,
      highBreaks: 0,
      lowBreaks: 0,
      topTicks: 0,
      midTicks: 1,
      bottomTicks: 0,
      ticks: [price]
    };
  }

  updateCandle(candle, price, ts) {
    const oldHigh = candle.high;
    const oldLow = candle.low;
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
    candle.lastTickTs = ts;
    candle.tickCount += 1;
    candle.ticks.push(price);
    if (price > oldHigh) candle.highBreaks += 1;
    if (price < oldLow) candle.lowBreaks += 1;
    this.recalculateZones(candle);
  }

  recalculateZones(candle) {
    const range = Math.max(candle.high - candle.low, 0.01);
    candle.topTicks = 0;
    candle.midTicks = 0;
    candle.bottomTicks = 0;
    for (const price of candle.ticks) {
      const pct = (price - candle.low) / range;
      if (pct >= 0.6) candle.topTicks += 1;
      else if (pct <= 0.4) candle.bottomTicks += 1;
      else candle.midTicks += 1;
    }
  }

  finalize(candle) {
    if (isNonMarketCandle(candle)) return null;
    return this.decorate(candle);
  }

  decorate(candle) {
    if (!candle) return null;
    const tickCount = Math.max(candle.tickCount, 1);
    const range = Math.max(candle.high - candle.low, 0);
    const body = Math.abs(candle.close - candle.open);
    const direction = candle.close >= candle.open ? 'bullish' : 'bearish';
    const pattern = identifyPattern(candle, { range, body, direction });
    const copy = { ...candle };
    delete copy.ticks;
    return {
      ...copy,
      endTime: new Date(candle.bucket + this.intervalMs).toISOString(),
      direction,
      pattern: pattern.name,
      patternBias: pattern.bias,
      patternStrength: pattern.strength,
      range,
      body,
      topPct: round((candle.topTicks / tickCount) * 100),
      midPct: round((candle.midTicks / tickCount) * 100),
      bottomPct: round((candle.bottomTicks / tickCount) * 100),
      highBreakPct: round((candle.highBreaks / tickCount) * 100),
      lowBreakPct: round((candle.lowBreaks / tickCount) * 100)
    };
  }

  persist(candle) {
    const day = candle.startTime.slice(0, 10);
    const dirPath = this.candleDir();
    fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, `${day}.jsonl`);
    fs.appendFileSync(filePath, `${JSON.stringify(candle)}\n`);
  }

  getSnapshot() {
    return {
      symbol: this.symbol,
      token: this.token,
      intervalMs: this.intervalMs,
      current: this.decorate(this.current),
      closed: this.closedCandles.slice(-this.maxCandles)
    };
  }

  loadClosedCandles(candles = []) {
    const byBucket = new Map();
    for (const candle of candles) {
      const normalized = this.normalizePersistedCandle(candle);
      if (!normalized) continue;
      byBucket.set(normalized.bucket, normalized);
    }
    this.closedCandles = Array.from(byBucket.values())
      .sort((a, b) => Number(a.bucket) - Number(b.bucket))
      .slice(-this.maxCandles);
  }

  normalizePersistedCandle(candle) {
    if (!candle) return null;
    const bucket = Number(candle.bucket);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    if (![bucket, open, high, low, close].every(Number.isFinite)) return null;

    const tickCount = Math.max(Number(candle.tickCount || 1), 1);
    const copy = {
      ...candle,
      symbol: candle.symbol || this.symbol,
      token: String(candle.token || this.token),
      bucket,
      startTime: candle.startTime || new Date(bucket).toISOString(),
      open,
      high,
      low,
      close,
      firstTickTs: Number(candle.firstTickTs || bucket),
      lastTickTs: Number(candle.lastTickTs || bucket),
      tickCount,
      highBreaks: Number(candle.highBreaks || 0),
      lowBreaks: Number(candle.lowBreaks || 0),
      topTicks: Number(candle.topTicks || 0),
      midTicks: Number(candle.midTicks || 0),
      bottomTicks: Number(candle.bottomTicks || 0)
    };
    return this.decorate(copy);
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function isNonMarketCandle(candle) {
  if (!candle) return true;
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  return (
    Number.isFinite(open) &&
    open === high &&
    high === low &&
    low === close &&
    Number(candle.highBreaks || 0) === 0 &&
    Number(candle.lowBreaks || 0) === 0
  );
}

function identifyPattern(candle, metrics) {
  const range = Number(metrics.range || 0);
  const body = Number(metrics.body || 0);
  if (range <= 0) return pattern('No Range', 'neutral', 0);

  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const bodyPct = body / range;
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const upperPct = upperWick / range;
  const lowerPct = lowerWick / range;
  const direction = metrics.direction;

  if (bodyPct <= 0.1) {
    if (upperPct >= 0.35 && lowerPct >= 0.35) return pattern('Long-Legged Doji', 'neutral', 4);
    if (lowerPct >= 0.6) return pattern('Dragonfly Doji', 'bullish', 4);
    if (upperPct >= 0.6) return pattern('Gravestone Doji', 'bearish', 4);
    return pattern('Doji', 'neutral', 3);
  }

  if (bodyPct >= 0.82 && upperPct <= 0.1 && lowerPct <= 0.1) {
    return pattern(direction === 'bullish' ? 'Bullish Marubozu' : 'Bearish Marubozu', direction, 5);
  }

  if (lowerWick >= body * 2 && upperPct <= 0.22) {
    return pattern(direction === 'bullish' ? 'Hammer' : 'Hanging Man', direction === 'bullish' ? 'bullish' : 'bearish', 4);
  }

  if (upperWick >= body * 2 && lowerPct <= 0.22) {
    return pattern(direction === 'bearish' ? 'Shooting Star' : 'Inverted Hammer', direction === 'bearish' ? 'bearish' : 'bullish', 4);
  }

  if (bodyPct <= 0.35 && upperPct >= 0.25 && lowerPct >= 0.25) {
    return pattern('Spinning Top', 'neutral', 2);
  }

  if (bodyPct >= 0.6) {
    return pattern(direction === 'bullish' ? 'Strong Bullish Candle' : 'Strong Bearish Candle', direction, 3);
  }

  return pattern(direction === 'bullish' ? 'Bullish Candle' : 'Bearish Candle', direction, 1);
}

function pattern(name, bias, strength) {
  return { name, bias, strength };
}

function safePathPart(value) {
  return String(value || 'instrument')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'instrument';
}

module.exports = CandleEngine;
