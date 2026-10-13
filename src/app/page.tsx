'use client';

import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useTradingStore } from '@/store/useTradingStore';
import { BinanceMultiTickerClient } from '@/services/binance/binance-ws';
import { fetch24hTickers } from '@/services/binance/binance-rest';
import { Header } from '@/components/layout/Header';
import { LeftToolbar } from '@/components/layout/LeftToolbar';
import { Watchlist } from '@/components/watchlist/Watchlist';
import { SignalsPanel } from '@/components/signals/SignalsPanel';
import { SymbolSearchModal } from '@/components/modals/SymbolSearchModal';
import { IndicatorModal } from '@/components/modals/IndicatorModal';
import { StrategyModal } from '@/components/modals/StrategyModal';
import { AcademyModal } from '@/components/modals/AcademyModal';
import { CalculatorModal } from '@/components/modals/CalculatorModal';
import { WalletModal } from '@/components/modals/WalletModal';
import { BotModal } from '@/components/modals/BotModal';
import { TelegramModal } from '@/components/modals/TelegramModal';
import { PythModal } from '@/components/modals/PythModal';
import { HyperliquidModal } from '@/components/modals/HyperliquidModal';
import { GlobalOpportunitiesModal } from '@/components/modals/GlobalOpportunitiesModal';
import { BankTestModal } from '@/components/modals/BankTestModal';

// Dynamically import PriceChart with SSR disabled since lightweight-charts requires DOM/Canvas
const PriceChart = dynamic(
  () => import('@/components/chart/PriceChart').then((mod) => mod.PriceChart),
  { ssr: false }
);

export default function Home() {
  const { updatePositionsWithTickers, setWatchlist } = useTradingStore();
  const multiTickerClientRef = useRef<BinanceMultiTickerClient | null>(null);

  // Global Real-Time Multi-Ticker Stream for All Open Positions & Watchlist
  useEffect(() => {
    let isCancelled = false;

    // 1. WebSocket Multi-Ticker Stream (1s live ticks for all Binance spot pairs)
    const client = new BinanceMultiTickerClient((tickers) => {
      if (isCancelled || tickers.length === 0) return;

      const priceMap: Record<string, { price: number; high: number; low: number }> = {};
      tickers.forEach((t) => {
        priceMap[t.symbol] = {
          price: t.price,
          high: t.high,
          low: t.low,
        };
      });

      updatePositionsWithTickers(priceMap);
    });

    multiTickerClientRef.current = client;
    client.connect();

    // 2. High-Frequency Fallback Poller (every 3 seconds)
    const pollTickers = async () => {
      try {
        const freshTickers = await fetch24hTickers();
        if (isCancelled || freshTickers.length === 0) return;
        setWatchlist(freshTickers);
      } catch (err) {
        // Silently retry on next interval
      }
    };

    pollTickers();
    const interval = setInterval(pollTickers, 3000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      if (multiTickerClientRef.current) {
        multiTickerClientRef.current.unsubscribe();
        multiTickerClientRef.current = null;
      }
    };
  }, [updatePositionsWithTickers, setWatchlist]);

  return (
    <main className="h-screen w-screen flex flex-col bg-[#131722] text-[#d1d4dc] overflow-hidden">
      {/* Header bar */}
      <Header />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Drawing Toolbar */}
        <LeftToolbar />

        {/* Center Area: Chart + Signals Panel */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          <PriceChart />
          <SignalsPanel />
        </div>

        {/* Right Sidebar: Watchlist */}
        <Watchlist />
      </div>

      {/* Modals & Dialogs */}
      <SymbolSearchModal />
      <IndicatorModal />
      <StrategyModal />
      <AcademyModal />
      <CalculatorModal />
      <WalletModal />
      <BotModal />
      <TelegramModal />
      <PythModal />
      <HyperliquidModal />
      <GlobalOpportunitiesModal />
      <BankTestModal />
    </main>
  );
}
