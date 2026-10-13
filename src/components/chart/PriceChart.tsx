'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  SeriesMarker,
  Time,
  LineStyle,
} from 'lightweight-charts';
import { useTradingStore } from '@/store/useTradingStore';
import { fetchHistoricalKlines } from '@/services/binance/binance-rest';
import { BinanceWebSocketClient } from '@/services/binance/binance-ws';
import { HyperliquidWebSocketClient } from '@/services/hyperliquid/hyperliquid-ws';
import {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateSuperTrend,
} from '@/services/indicators/calculations';
import { evaluateTradingSignals } from '@/services/signals/strategy-engine';
import { Candle, TradingSignal } from '@/types';
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Zap,
  Calculator,
  X,
  Sparkles,
  Play,
  Hourglass,
  ExternalLink,
} from 'lucide-react';

export const PriceChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);

  const chartInstance = useRef<IChartApi | null>(null);
  const rsiChartInstance = useRef<IChartApi | null>(null);

  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const supertrendRef = useRef<ISeriesApi<'Line'> | null>(null);

  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const wsClientRef = useRef<any>(null);
  const markersPrimitiveRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const isDisposedRef = useRef<boolean>(false);
  const syncRangeUnsubRef = useRef<(() => void) | null>(null);

  const {
    currentSymbol,
    currentTimeframe,
    indicators,
    strategies,
    setCandles,
    updateLastCandle,
    signals,
    setSignals,
    isLoadingCandles,
    setLoadingCandles,
    onlyCurrentSignals,
    selectedSignal,
    setSelectedSignal,
    executePaperTrade,
    setWalletModalOpen,
    setCalculatorModalOpen,
    dismissedSignalIds,
    signalFilterTab,
    hidePastChartMarkers,
    dismissSignal,
    watchlist,
  } = useTradingStore();

  const currentTicker = useMemo(
    () => watchlist.find((w) => w.symbol === currentSymbol),
    [watchlist, currentSymbol]
  );
  const isHyperliquidAsset = Boolean(
    currentTicker?.isHyperliquid ||
    currentSymbol.toUpperCase().endsWith('-PERP') ||
    currentSymbol.toUpperCase().startsWith('HL-')
  );
  const hyperliquidCoin = currentSymbol.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();

  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [cardExecuted, setCardExecuted] = useState<'MARKET' | 'LIMIT' | null>(null);

  const getPriceFormatConfig = (price: number) => {
    if (!price || price === 0) {
      return { type: 'price' as const, precision: 4, minMove: 0.0001 };
    }
    if (price < 0.00001) {
      return { type: 'price' as const, precision: 8, minMove: 0.00000001 };
    }
    if (price < 0.001) {
      return { type: 'price' as const, precision: 6, minMove: 0.000001 };
    }
    if (price < 1) {
      return { type: 'price' as const, precision: 6, minMove: 0.000001 };
    }
    if (price < 10) {
      return { type: 'price' as const, precision: 4, minMove: 0.0001 };
    }
    if (price < 100) {
      return { type: 'price' as const, precision: 3, minMove: 0.001 };
    }
    return { type: 'price' as const, precision: 2, minMove: 0.01 };
  };

  const formatPrice = (p: number) => {
    if (!p && p !== 0) return '0.00';
    if (p < 0.00001) return p.toFixed(8);
    if (p < 0.001) return p.toFixed(6);
    if (p < 1) return p.toFixed(6);
    if (p < 10) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return p.toFixed(2);
  };

  // Function to clear and update Entry, SL and TP price lines on the chart
  const updateTargetPriceLines = useCallback((activeSignal: TradingSignal | null) => {
    if (!candleSeriesRef.current || isDisposedRef.current) return;

    // Remove existing price lines
    priceLinesRef.current.forEach((pl) => {
      try {
        candleSeriesRef.current?.removePriceLine(pl);
      } catch (err) {
        // Ignore
      }
    });
    priceLinesRef.current = [];

    // CRITICAL: Only draw price lines if the signal strictly matches the current symbol!
    if (!activeSignal || activeSignal.symbol.toUpperCase() !== currentSymbol.toUpperCase()) {
      return;
    }

    const isBuy = activeSignal.type === 'BUY';
    const entry = activeSignal.price;
    const sl = activeSignal.stopLoss;
    const tp1 = activeSignal.takeProfit1;
    const tp2 = activeSignal.takeProfit2;

    if (!entry || entry <= 0) return;

    const riskPct = entry > 0 ? (Math.abs(entry - sl) / entry) * 100 : 0;
    const tp1Pct = entry > 0 ? (Math.abs(tp1 - entry) / entry) * 100 : 0;

    try {
      // 1. Entry Line
      const entryLine = candleSeriesRef.current.createPriceLine({
        price: entry,
        color: '#ffffff',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `ENTRADA ${activeSignal.type}: $${formatPrice(entry)}`,
      });
      priceLinesRef.current.push(entryLine);

      // 2. Stop Loss Line
      const slLine = candleSeriesRef.current.createPriceLine({
        price: sl,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `STOP LOSS: $${formatPrice(sl)} (-${riskPct.toFixed(1)}%)`,
      });
      priceLinesRef.current.push(slLine);

      // 3. Take Profit 1 Line
      const tp1Line = candleSeriesRef.current.createPriceLine({
        price: tp1,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TAKE PROFIT 1: $${formatPrice(tp1)} (+${tp1Pct.toFixed(1)}%)`,
      });
      priceLinesRef.current.push(tp1Line);

      // 4. Take Profit 2 Line (if valid)
      if (tp2 && tp2 !== tp1) {
        const tp2Line = candleSeriesRef.current.createPriceLine({
          price: tp2,
          color: '#10b981',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `TAKE PROFIT 2: $${formatPrice(tp2)}`,
        });
        priceLinesRef.current.push(tp2Line);
      }
    } catch (err) {
      console.warn('Error creating target price lines:', err);
    }
  }, [currentSymbol]);

  // Update indicators and signal markers on data change
  const refreshIndicatorsAndSignals = useCallback(
    (currentCandles: Candle[]) => {
      if (isDisposedRef.current || !chartInstance.current || currentCandles.length === 0) return;

      try {
        // 1. Volume
        if (volumeSeriesRef.current) {
          if (indicators.volume) {
            const volData = currentCandles.map((c) => ({
              time: c.time as Time,
              value: c.volume,
              color: c.close >= c.open ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)',
            }));
            volumeSeriesRef.current.setData(volData);
          } else {
            volumeSeriesRef.current.setData([]);
          }
        }

        // 2. EMAs
        if (ema9SeriesRef.current) {
          ema9SeriesRef.current.setData(
            indicators.ema9 ? (calculateEMA(currentCandles, 9) as any) : []
          );
        }
        if (ema20SeriesRef.current) {
          ema20SeriesRef.current.setData(
            indicators.ema20 ? (calculateEMA(currentCandles, 20) as any) : []
          );
        }
        if (ema50SeriesRef.current) {
          ema50SeriesRef.current.setData(
            indicators.ema50 ? (calculateEMA(currentCandles, 50) as any) : []
          );
        }
        if (ema200SeriesRef.current) {
          ema200SeriesRef.current.setData(
            indicators.ema200 ? (calculateEMA(currentCandles, 200) as any) : []
          );
        }

        // 3. Bollinger Bands
        if (bbUpperRef.current && bbMiddleRef.current && bbLowerRef.current) {
          if (indicators.bollinger) {
            const bbData = calculateBollingerBands(
              currentCandles,
              indicators.bollingerPeriod,
              indicators.bollingerStdDev
            );
            bbUpperRef.current.setData(bbData.map((b) => ({ time: b.time as Time, value: b.upper })));
            bbMiddleRef.current.setData(bbData.map((b) => ({ time: b.time as Time, value: b.middle })));
            bbLowerRef.current.setData(bbData.map((b) => ({ time: b.time as Time, value: b.lower })));
          } else {
            bbUpperRef.current.setData([]);
            bbMiddleRef.current.setData([]);
            bbLowerRef.current.setData([]);
          }
        }

        // 4. SuperTrend
        if (supertrendRef.current) {
          if (indicators.supertrend) {
            const stData = calculateSuperTrend(
              currentCandles,
              indicators.supertrendPeriod,
              indicators.supertrendMultiplier
            );
            supertrendRef.current.setData(stData as any);
          } else {
            supertrendRef.current.setData([]);
          }
        }

        // 5. RSI (Separated Sub-pane)
        if (rsiSeriesRef.current) {
          if (indicators.rsi) {
            const rsiData = calculateRSI(currentCandles, indicators.rsiPeriod);
            rsiSeriesRef.current.setData(rsiData as any);
          } else {
            rsiSeriesRef.current.setData([]);
          }
        }

        const detectedSignals = evaluateTradingSignals(
          currentCandles,
          currentSymbol,
          currentTimeframe,
          strategies
        );
        setSignals(detectedSignals);

        // BOT AUTONOMOUS HOOK: evaluate newest live signal
        const { isBotActive, evaluateAndRunBotSignal } = useTradingStore.getState();
        if (isBotActive && detectedSignals.length > 0) {
          evaluateAndRunBotSignal(detectedSignals[0]);
        }

        // 1. Exclude dismissed signals
        const nonDismissedSignals = detectedSignals.filter(
          (s) => !dismissedSignalIds.includes(s.id)
        );

        // 2. Select signals for chart markers: only active / current signals if filter is active
        let signalsToDisplay: TradingSignal[] = nonDismissedSignals;
        if (signalFilterTab === 'ACTIVE' || hidePastChartMarkers) {
          signalsToDisplay = nonDismissedSignals.filter(
            (s) => s.status === 'ACTIVE' || s.status === 'TP1_HIT' || s.isCurrent
          );
        } else if (signalFilterTab === 'RECENT') {
          signalsToDisplay = nonDismissedSignals.slice(0, 5);
        }

        if (candleSeriesRef.current) {
          const markers: SeriesMarker<Time>[] = signalsToDisplay.map((sig: TradingSignal) => ({
            time: sig.time as Time,
            position: sig.type === 'BUY' ? 'belowBar' : 'aboveBar',
            color: sig.type === 'BUY' ? '#089981' : '#f23645',
            shape: sig.type === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: `${sig.type} ($${sig.price < 1 ? sig.price.toFixed(4) : sig.price.toFixed(2)})`,
            size: 2,
          }));

          try {
            if (markersPrimitiveRef.current && typeof markersPrimitiveRef.current.setMarkers === 'function') {
              markersPrimitiveRef.current.setMarkers(markers);
            } else if (typeof createSeriesMarkers === 'function') {
              markersPrimitiveRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
            } else if (typeof (candleSeriesRef.current as any).setMarkers === 'function') {
              (candleSeriesRef.current as any).setMarkers(markers);
            }
          } catch (err) {
            // Safe fallback
          }
        }
      } catch (err) {
        console.warn('Indicators refresh skipped:', err);
      }
    },
    [
      currentSymbol,
      currentTimeframe,
      indicators,
      strategies,
      setSignals,
      onlyCurrentSignals,
      dismissedSignalIds,
      signalFilterTab,
      hidePastChartMarkers,
    ]
  );

  // Sync Target Price Lines when selectedSignal or signals change
  const activeFocusSignal = useMemo(() => {
    if (
      selectedSignal &&
      selectedSignal.symbol.toUpperCase() === currentSymbol.toUpperCase() &&
      !dismissedSignalIds.includes(selectedSignal.id)
    ) {
      return selectedSignal;
    }
    const currentSymbolSignals = signals.filter(
      (s) =>
        s.symbol.toUpperCase() === currentSymbol.toUpperCase() &&
        !dismissedSignalIds.includes(s.id)
    );

    // Prefer active / valid signals
    const activeValid = currentSymbolSignals.filter(
      (s) => s.status === 'ACTIVE' || s.status === 'TP1_HIT' || s.isCurrent
    );
    if (activeValid.length > 0) return activeValid[0];

    return currentSymbolSignals.length > 0 ? currentSymbolSignals[0] : null;
  }, [selectedSignal, signals, currentSymbol, dismissedSignalIds]);

  useEffect(() => {
    updateTargetPriceLines(activeFocusSignal);
  }, [activeFocusSignal, updateTargetPriceLines]);

  // Initialize Charts
  useEffect(() => {
    isDisposedRef.current = false;
    if (!chartContainerRef.current) return;

    // Main Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#030305' },
        textColor: '#64748b',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(255, 255, 255, 0.2)', width: 1, style: 3 },
        horzLine: { color: 'rgba(255, 255, 255, 0.2)', width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.07)',
        autoScale: true,
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.07)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartInstance.current = chart;

    // Volume Series
    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      color: 'rgba(255, 255, 255, 0.15)',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Overlay over chart
    });
    volumeSeriesRef.current.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });

    // Candlestick Series
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    // Indicator Line Series (Refined 1px elegant lines)
    ema9SeriesRef.current = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });
    ema20SeriesRef.current = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });
    ema50SeriesRef.current = chart.addSeries(LineSeries, {
      color: '#ec4899',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });
    ema200SeriesRef.current = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });

    // Bollinger Series
    bbUpperRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(255, 255, 255, 0.2)',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });
    bbMiddleRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(255, 255, 255, 0.35)',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });
    bbLowerRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(255, 255, 255, 0.2)',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });

    // SuperTrend Series
    supertrendRef.current = chart.addSeries(LineSeries, {
      color: '#10b981',
      lineWidth: 1,
      crosshairMarkerVisible: false,
    });

    // RSI Sub-pane Chart if container exists
    if (rsiContainerRef.current && indicators.rsi) {
      const rsiChart = createChart(rsiContainerRef.current, {
        layout: {
          background: { color: '#030305' },
          textColor: '#64748b',
          fontSize: 10,
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.07)',
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.07)',
          timeVisible: true,
        },
      });

      rsiChartInstance.current = rsiChart;

      rsiSeriesRef.current = rsiChart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 1,
      });

      // Add RSI 70/30 baseline lines
      rsiSeriesRef.current.createPriceLine({
        price: 70,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Sobrecompra (70)',
      });

      rsiSeriesRef.current.createPriceLine({
        price: 30,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Sobrevents (30)',
      });

      // Synchronize time scales
      const mainTimeScale = chart.timeScale();
      const rsiTimeScale = rsiChart.timeScale();

      const syncHandler = (range: any) => {
        if (range) {
          try {
            rsiTimeScale.setVisibleLogicalRange(range);
          } catch (e) {
            // Ignore if disposed
          }
        }
      };

      mainTimeScale.subscribeVisibleLogicalRangeChange(syncHandler);
      syncRangeUnsubRef.current = () => {
        try {
          mainTimeScale.unsubscribeVisibleLogicalRangeChange(syncHandler);
        } catch (e) {
          // Ignore
        }
      };
    }

    // Crosshair move handler
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || isDisposedRef.current) {
        setHoveredCandle(null);
        return;
      }
      if (candleSeriesRef.current) {
        const data = param.seriesData.get(candleSeriesRef.current) as any;
        if (data) {
          setHoveredCandle({
            time: param.time as any,
            open: data.open,
            high: data.high,
            low: data.low,
            close: data.close,
            volume: data.volume || 0,
          });
        }
      }
    });

    // Resize Observer
    const handleResize = () => {
      if (chartContainerRef.current && chartInstance.current && !isDisposedRef.current) {
        chartInstance.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
      if (rsiContainerRef.current && rsiChartInstance.current && !isDisposedRef.current) {
        rsiChartInstance.current.applyOptions({
          width: rsiContainerRef.current.clientWidth,
          height: rsiContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposedRef.current = true;
      window.removeEventListener('resize', handleResize);
      if (syncRangeUnsubRef.current) {
        syncRangeUnsubRef.current();
        syncRangeUnsubRef.current = null;
      }
      if (chartInstance.current) {
        chartInstance.current.remove();
        chartInstance.current = null;
      }
      if (rsiChartInstance.current) {
        rsiChartInstance.current.remove();
        rsiChartInstance.current = null;
      }
    };
  }, [indicators.rsi]);

  // Fetch Candles & Connect WebSocket
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoadingCandles(true);
      // Immediately clear previous price lines so chart doesn't rescale to old asset's price
      updateTargetPriceLines(null);

      try {
        const historicalCandles = await fetchHistoricalKlines(currentSymbol, currentTimeframe, 500);
        if (isCancelled || isDisposedRef.current) return;

        setCandles(historicalCandles);

        const latestPrice = historicalCandles[historicalCandles.length - 1]?.close || 1;
        const priceFormatConfig = getPriceFormatConfig(latestPrice);

        if (candleSeriesRef.current) {
          candleSeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });
          candleSeriesRef.current.setData(historicalCandles as any);
        }

        if (ema9SeriesRef.current) ema9SeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });
        if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });
        if (ema50SeriesRef.current) ema50SeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });
        if (ema200SeriesRef.current) ema200SeriesRef.current.applyOptions({ priceFormat: priceFormatConfig });
        if (bbUpperRef.current) bbUpperRef.current.applyOptions({ priceFormat: priceFormatConfig });
        if (bbMiddleRef.current) bbMiddleRef.current.applyOptions({ priceFormat: priceFormatConfig });
        if (bbLowerRef.current) bbLowerRef.current.applyOptions({ priceFormat: priceFormatConfig });
        if (supertrendRef.current) supertrendRef.current.applyOptions({ priceFormat: priceFormatConfig });

        if (volumeSeriesRef.current) {
          const volumeData = historicalCandles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? '#08998133' : '#f2364533',
          }));
          volumeSeriesRef.current.setData(volumeData as any);
        }

        refreshIndicatorsAndSignals(historicalCandles);

        // Auto-scale price and time axis for the new coin
        if (chartInstance.current) {
          chartInstance.current.timeScale().fitContent();
          chartInstance.current.priceScale('right').applyOptions({
            autoScale: true,
          });
        }
      } catch (err) {
        console.error('Error fetching candles:', err);
      } finally {
        if (!isCancelled) {
          setLoadingCandles(false);
        }
      }
    }

    loadData();

    // Setup Live WebSocket
    if (wsClientRef.current) {
      wsClientRef.current.unsubscribe();
      wsClientRef.current = null;
    }

    let lastIndicatorRefreshTime = 0;

    const onLiveCandleReceived = (liveCandle: Candle) => {
      if (isDisposedRef.current) return;

      updateLastCandle(liveCandle);

      // Alimentar el Banco de Pruebas $100k y Motor de Micro-Velas en tiempo real (Rolling Window)
      const { processMicroTick } = useTradingStore.getState();
      processMicroTick(liveCandle.close, liveCandle.volume, Date.now());

      if (candleSeriesRef.current) {
        candleSeriesRef.current.update(liveCandle as any);
      }

      // Throttle indicator recalculation to once every 1.5 seconds
      const now = Date.now();
      if (now - lastIndicatorRefreshTime > 1500) {
        lastIndicatorRefreshTime = now;
        const { candles } = useTradingStore.getState();
        if (candles.length > 0) {
          refreshIndicatorsAndSignals(candles);
        }
      }
    };

    // Heartbeat de 1s para asegurar que las micro-temporalidades (1s, 3s, 5s) nunca se congelen
    const microHeartbeatInterval = setInterval(() => {
      if (isDisposedRef.current) return;
      const { candles, processMicroTick } = useTradingStore.getState();
      if (candles.length > 0) {
        const lastPrice = candles[candles.length - 1].close;
        if (lastPrice > 0) {
          processMicroTick(lastPrice, 1, Date.now());
        }
      }
    }, 1000);

    if (isHyperliquidAsset) {
      const hlWs = new HyperliquidWebSocketClient(
        currentSymbol,
        currentTimeframe,
        onLiveCandleReceived
      );
      wsClientRef.current = hlWs;
      hlWs.connect();
    } else {
      const ws = new BinanceWebSocketClient(
        currentSymbol,
        currentTimeframe,
        onLiveCandleReceived
      );
      wsClientRef.current = ws;
      ws.connect();
    }

    return () => {
      isCancelled = true;
      clearInterval(microHeartbeatInterval);
      if (wsClientRef.current) {
        wsClientRef.current.unsubscribe();
        wsClientRef.current = null;
      }
    };
  }, [currentSymbol, currentTimeframe, setLoadingCandles, setCandles, updateLastCandle, refreshIndicatorsAndSignals]);

  // Refresh indicators when indicator or strategy settings change
  useEffect(() => {
    const { candles } = useTradingStore.getState();
    if (candles.length > 0 && !isDisposedRef.current) {
      refreshIndicatorsAndSignals(candles);
    }
  }, [indicators, strategies, refreshIndicatorsAndSignals]);

  const handleSimulateActiveSignal = (sig: TradingSignal) => {
    executePaperTrade(sig, 100);
    setWalletModalOpen(true);
  };

  const handleOpenCalculator = (sig: TradingSignal) => {
    setSelectedSignal(sig);
    setCalculatorModalOpen(true);
  };

  const [isCardDismissed, setIsCardDismissed] = useState<boolean>(false);
  const [cardPosition, setCardPosition] = useState<'top-left' | 'top-right' | 'bottom-left'>('top-left');

  // Re-open card if user clicks a new signal in the table
  useEffect(() => {
    if (selectedSignal) {
      setIsCardDismissed(false);
    }
  }, [selectedSignal]);

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-[#030305] relative overflow-hidden">
      {/* Top Chart Legend / OHLCV Bar */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center space-x-3 text-[11px] font-mono text-slate-400 pointer-events-auto bg-[#050608]/85 backdrop-blur-xl px-2.5 py-1 rounded-lg border border-white/[0.07]">
        <div className="flex items-center space-x-1.5">
          <span className="font-normal text-white">
            {currentSymbol} • {currentTimeframe}
          </span>
          {isHyperliquidAsset && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              HYPERLIQUID L1
            </span>
          )}
          {currentTicker?.fundingRate !== undefined && (
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${
                currentTicker.fundingRate >= 0
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}
              title={`Funding Rate anualizado: ${currentTicker.fundingRateAnnualized?.toFixed(2)}%`}
            >
              FR: {(currentTicker.fundingRate * 100).toFixed(4)}%
            </span>
          )}
        </div>
        {hoveredCandle && (
          <div className="flex items-center space-x-2 font-mono text-[10px]">
            <span>
              O: <b className="text-white font-normal">${formatPrice(hoveredCandle.open)}</b>
            </span>
            <span>
              H: <b className="text-[#10b981] font-normal">${formatPrice(hoveredCandle.high)}</b>
            </span>
            <span>
              L: <b className="text-[#f43f5e] font-normal">${formatPrice(hoveredCandle.low)}</b>
            </span>
            <span>
              C: <b className={hoveredCandle.close >= hoveredCandle.open ? 'text-[#10b981] font-normal' : 'text-[#f43f5e] font-normal'}>
                ${formatPrice(hoveredCandle.close)}
              </b>
            </span>
            <span>
              V: <b className="text-white font-normal">{(hoveredCandle.volume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
            </span>
          </div>
        )}
        {isHyperliquidAsset && (
          <a
            href={`https://app.hyperliquid.xyz/trade/${hyperliquidCoin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 transition-all text-[9px] font-medium"
            title="Abrir este mercado en app.hyperliquid.xyz"
          >
            <span>Trade en HL</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>

      {/* Reopen Floating Setup Button if Dismissed */}
      {activeFocusSignal && isCardDismissed && (
        <button
          onClick={() => setIsCardDismissed(false)}
          className="absolute top-10 left-3 z-20 flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#08090d]/90 backdrop-blur-xl border border-white/[0.1] hover:border-white/25 text-white text-[11px] font-mono shadow-lg transition-all hover:bg-white/[0.05] cursor-pointer"
          title="Reabrir ventana de setup de la estrategia"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
          <span>Ver Setup ({activeFocusSignal.type} ${formatPrice(activeFocusSignal.price)})</span>
        </button>
      )}

      {/* Floating Target Overlay: Risk/Reward Strategy Analysis Box */}
      {activeFocusSignal && !isCardDismissed && (
        <div
          className={`absolute z-20 bg-[#08090d]/95 backdrop-blur-2xl border border-white/[0.1] rounded-xl p-3 shadow-2xl max-w-sm text-xs font-mono select-none animate-in fade-in duration-200 ${
            cardPosition === 'top-left'
              ? 'top-10 left-3'
              : cardPosition === 'top-right'
              ? 'top-10 right-3'
              : 'bottom-4 left-3'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-2 mb-2">
            <div className="flex items-center space-x-1.5">
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                activeFocusSignal.type === 'BUY'
                  ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                  : 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30'
              }`}>
                {activeFocusSignal.type}
              </span>
              <span className="font-medium text-white text-[11px] truncate max-w-[140px]" title={activeFocusSignal.strategy}>
                {activeFocusSignal.strategy}
              </span>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={() =>
                  setCardPosition((prev) =>
                    prev === 'top-left' ? 'top-right' : prev === 'top-right' ? 'bottom-left' : 'top-left'
                  )
                }
                className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-white/[0.02] hover:bg-white/[0.06] text-[10px] transition-colors border border-white/[0.06] cursor-pointer"
                title="Mover ventana (Izquierda / Derecha / Abajo)"
              >
                ⇄ Mover
              </button>

              <button
                onClick={() => {
                  if (activeFocusSignal) {
                    dismissSignal(activeFocusSignal.id);
                  }
                  setIsCardDismissed(true);
                  setSelectedSignal(null);
                  updateTargetPriceLines(null);
                }}
                className="text-slate-400 hover:text-[#f43f5e] p-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Descartar y ocultar esta oportunidad del gráfico"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Analysis Details */}
          <div className="space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Precio Entrada:</span>
              <span className="font-normal text-white">${formatPrice(activeFocusSignal.price)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#10b981] flex items-center">
                <Target className="w-3 h-3 mr-1" /> Take Profit 1:
              </span>
              <span className="font-normal text-[#10b981]">${formatPrice(activeFocusSignal.takeProfit1)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#f43f5e] flex items-center">
                <Shield className="w-3 h-3 mr-1" /> Stop Loss (SL):
              </span>
              <span className="font-normal text-[#f43f5e]">${formatPrice(activeFocusSignal.stopLoss)}</span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/[0.06]">
              <span className="text-slate-400">Ratio R:R:</span>
              <span className="font-medium text-white">{activeFocusSignal.riskReward}</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-3 pt-2 border-t border-white/[0.07] flex items-center space-x-1.5">
            {cardExecuted ? (
              <div className="flex-1 py-1.5 text-center rounded-lg text-[10px] font-mono text-[#10b981] bg-[#10b981]/15 border border-[#10b981]/30 animate-pulse font-medium">
                ✓ {cardExecuted === 'MARKET' ? 'Orden a Mercado Ejecutada' : 'Orden Limit Colocada'}
              </div>
            ) : (
              <>
                <button
                  onClick={() => {
                    executePaperTrade(activeFocusSignal, 100, 'MARKET');
                    setCardExecuted('MARKET');
                    setTimeout(() => setCardExecuted(null), 2000);
                  }}
                  className="flex-1 px-2 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-[10px] flex items-center justify-center space-x-1 transition-all cursor-pointer shadow-xs"
                  title="Entrar inmediatamente al precio de mercado en vivo sin abrir la billetera"
                >
                  <Zap className="w-3 h-3 fill-current" />
                  <span>Mercado ($100)</span>
                </button>

                <button
                  onClick={() => {
                    executePaperTrade(activeFocusSignal, 100, 'LIMIT');
                    setCardExecuted('LIMIT');
                    setTimeout(() => setCardExecuted(null), 2000);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white font-medium text-[10px] flex items-center justify-center space-x-1 transition-colors border border-white/[0.09] cursor-pointer"
                  title="Colocar como orden limit esperando el precio"
                >
                  <Hourglass className="w-3 h-3" />
                  <span>Limit</span>
                </button>
              </>
            )}

            <button
              onClick={() => handleOpenCalculator(activeFocusSignal)}
              className="px-2 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 border border-white/[0.07] text-[10px] flex items-center space-x-1 transition-colors cursor-pointer"
              title="Calcular tamaño de posición"
            >
              <Calculator className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoadingCandles && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#131722]/80 backdrop-blur-xs">
          <Loader2 className="w-8 h-8 text-[#2962ff] animate-spin mb-2" />
          <span className="text-xs text-[#787b86] font-mono">
            Cargando velas de {currentSymbol}...
          </span>
        </div>
      )}

      {/* Main Candlestick Chart Canvas */}
      <div
        ref={chartContainerRef}
        className={`w-full ${indicators.rsi ? 'h-[75%]' : 'h-full'} transition-all`}
      />

      {/* RSI Sub-pane */}
      {indicators.rsi && (
        <div className="h-[25%] w-full border-t border-[#2a2e39] relative">
          <div className="absolute top-1 left-3 z-10 text-[10px] font-mono text-[#ab47bc] font-bold">
            RSI ({indicators.rsiPeriod}) [70 / 30]
          </div>
          <div ref={rsiContainerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
};
