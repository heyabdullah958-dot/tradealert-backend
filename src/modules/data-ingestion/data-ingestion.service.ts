import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { WebSocket } from 'ws';

@Injectable()
export class DataIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataIngestionService.name);
  private binanceWs: WebSocket | null = null;
  private derivWs: WebSocket | null = null;
  private isDestroyed = false;

  // We will track some default symbols to stream
  private readonly cryptoSymbols = ['btcusdt', 'ethusdt', 'solusdt', 'adausdt'];
  private readonly syntheticSymbols = ['R_75', 'R_100', '1HZ10V', '1HZ100V']; // Deriv Volatility Indices

  constructor(private readonly redisService: RedisService) {}

  onModuleInit() {
    this.connectBinance();
    this.connectDeriv();
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    this.disconnectAll();
  }

  private disconnectAll() {
    if (this.binanceWs) {
      this.binanceWs.close();
    }
    if (this.derivWs) {
      this.derivWs.close();
    }
  }

  // ==========================================
  // Binance WebSocket Integration (Crypto)
  // ==========================================
  private connectBinance() {
    if (this.isDestroyed) return;

    // Use Binance combined stream URL for multiple symbols
    const streams = this.cryptoSymbols.map((s) => `${s}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    this.logger.log(`Connecting to Binance WebSocket: ${url}`);
    const ws = new WebSocket(url);
    this.binanceWs = ws;

    ws.on('open', () => {
      this.logger.log('Binance WebSocket connection established');
    });

    ws.on('message', async (data: string) => {
      try {
        const payload = JSON.parse(data);
        const stream = payload.stream; // e.g. "btcusdt@ticker"
        const tickData = payload.data;

        if (stream && tickData) {
          const symbol = tickData.s; // e.g. "BTCUSDT"
          const price = parseFloat(tickData.c); // Last price

          await this.processPriceTick('CRYPTO', symbol, price);
        }
      } catch (err) {
        this.logger.error('Failed to parse Binance tick data:', err);
      }
    });

    ws.on('close', () => {
      this.logger.warn('Binance WebSocket connection closed. Reconnecting in 5 seconds...');
      this.binanceWs = null;
      setTimeout(() => this.connectBinance(), 5000);
    });

    ws.on('error', (err) => {
      this.logger.error('Binance WebSocket error:', err.message);
    });
  }

  // ==========================================
  // Deriv WebSocket Integration (Synthetic Indices)
  // ==========================================
  private connectDeriv() {
    if (this.isDestroyed) return;

    const appId = '1089'; // Public App ID for testing
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;

    this.logger.log(`Connecting to Deriv WebSocket: ${url}`);
    const ws = new WebSocket(url);
    this.derivWs = ws;

    ws.on('open', () => {
      this.logger.log('Deriv WebSocket connection established. Sending subscriptions...');
      
      // Subscribe to each Volatility Index ticker
      for (const symbol of this.syntheticSymbols) {
        ws.send(
          JSON.stringify({
            ticks: symbol,
            subscribe: 1,
          })
        );
      }
    });

    ws.on('message', async (data: string) => {
      try {
        const payload = JSON.parse(data);
        if (payload.msg_type === 'tick' && payload.tick) {
          const symbol = payload.tick.symbol; // e.g. "R_75"
          const price = parseFloat(payload.tick.quote);

          await this.processPriceTick('SYNTHETIC', symbol, price);
        }
      } catch (err) {
        this.logger.error('Failed to parse Deriv tick data:', err);
      }
    });

    ws.on('close', () => {
      this.logger.warn('Deriv WebSocket connection closed. Reconnecting in 5 seconds...');
      this.derivWs = null;
      setTimeout(() => this.connectDeriv(), 5000);
    });

    ws.on('error', (err) => {
      this.logger.error('Deriv WebSocket error:', err.message);
    });
  }

  // ==========================================
  // Core Tick Processing & Broadcasting
  // ==========================================
  private async processPriceTick(market: 'CRYPTO' | 'SYNTHETIC' | 'FOREX', symbol: string, price: number) {
    const uppercaseSymbol = symbol.toUpperCase();
    
    // 1. Cache the live price in Redis (so Rest APIs can quickly query it)
    await this.redisService.client.set(`price:${uppercaseSymbol}`, price.toString());

    // 2. Broadcast the price update to our Pub/Sub channel
    const eventPayload = {
      market,
      symbol: uppercaseSymbol,
      price,
      timestamp: Date.now(),
    };
    
    await this.redisService.client.publish(
      `tick:${market.toLowerCase()}`,
      JSON.stringify(eventPayload)
    );
  }
}
