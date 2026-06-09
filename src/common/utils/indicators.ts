/**
 * Utility functions for calculating technical indicators.
 */

// Exponential Moving Average (EMA)
export function calculateEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  if (prices.length === 0) return [];

  // Start with Simple Moving Average (SMA) as the first EMA value
  let sum = 0;
  const initialSMA = prices.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ema.push(NaN); // Not enough data
    } else if (i === period - 1) {
      ema.push(initialSMA);
    } else {
      const currentEma = prices[i] * k + ema[i - 1] * (1 - k);
      ema.push(currentEma);
    }
  }
  return ema;
}

// Relative Strength Index (RSI)
export function calculateRSI(prices: number[], period = 14): number[] {
  const rsi: number[] = [];
  if (prices.length <= period) {
    return Array(prices.length).fill(NaN);
  }

  let gains = 0;
  let losses = 0;

  // First RSI value calculations
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Fill initial values with NaN
  for (let i = 0; i < period; i++) {
    rsi.push(NaN);
  }
  
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - 100 / (1 + rs));

  // Subsequent values using Wilder's smoothing technique
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    let gain = 0;
    let loss = 0;
    
    if (diff > 0) {
      gain = diff;
    } else {
      loss = -diff;
    }

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  return rsi;
}

// Moving Average Convergence Divergence (MACD)
export interface MACDResult {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}

export function calculateMACD(
  prices: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const ema12 = calculateEMA(prices, fastPeriod);
  const ema26 = calculateEMA(prices, slowPeriod);
  
  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(ema12[i]) || isNaN(ema26[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(ema12[i] - ema26[i]);
    }
  }

  // Filter out NaNs to calculate Signal Line
  const validMacdValues = macdLine.filter((val) => !isNaN(val));
  const validSignalLine = calculateEMA(validMacdValues, signalPeriod);

  const signalLine: number[] = [];
  let signalIdx = 0;
  
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(macdLine[i])) {
      signalLine.push(NaN);
    } else {
      signalLine.push(validSignalLine[signalIdx++]);
    }
  }

  const histogram: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(signalLine[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - signalLine[i]);
    }
  }

  return { macdLine, signalLine, histogram };
}
