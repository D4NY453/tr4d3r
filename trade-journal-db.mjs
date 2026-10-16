import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';

import { getDataDir } from './lib/risk-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(getDataDir(), 'trade-journal.db');

export class TradeJournalDB {
  constructor(dbPath = DB_PATH) {
    this.dbPath = dbPath;
    this.db = null;
    this.init();
  }

  init() {
    try {
      this.db = new Database(this.dbPath, { timeout: 5000 });
      // Optimización de rendimiento y concurrencia sin bloqueos
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');

      // Crear tabla principal de auditoría de trades
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS trade_journal (
          id TEXT PRIMARY KEY,
          coin TEXT NOT NULL,
          symbol TEXT NOT NULL,
          side TEXT NOT NULL,
          entry_price REAL NOT NULL,
          exit_price REAL NOT NULL,
          stop_loss REAL,
          take_profit1 REAL,
          take_profit2 REAL,
          size REAL NOT NULL,
          capital_usd REAL NOT NULL,
          leverage INTEGER NOT NULL,
          pnl_usd REAL NOT NULL,
          pnl_percent REAL NOT NULL,
          fee_usd REAL DEFAULT 0.05,
          net_pnl_usd REAL,
          exit_reason TEXT,
          entry_time INTEGER NOT NULL,
          exit_time INTEGER NOT NULL,
          duration_seconds INTEGER,
          is_win INTEGER NOT NULL,
          execution_venue TEXT DEFAULT 'DITTO_NETWORK',
          
          -- Indicadores técnicos al entrar (Fase 2)
          rsi_14 REAL,
          stoch_k REAL,
          stoch_d REAL,
          atr_14 REAL,
          ema_trend TEXT,
          funding_rate REAL,
          spread_pct REAL,
          volume_24h_usd REAL,
          
          -- Jerarquía Multitemporal (MTF)
          macro_tf TEXT,
          macro_trend TEXT,
          
          -- Excursiones de precio (MFE / MAE)
          mfe_pct REAL,
          mae_pct REAL,
          
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_journal_coin ON trade_journal(coin);
        CREATE INDEX IF NOT EXISTS idx_journal_exit_time ON trade_journal(exit_time DESC);
        CREATE INDEX IF NOT EXISTS idx_journal_is_win ON trade_journal(is_win);
      `);

      // Migración dinámica de columnas para bases de datos existentes
      const tableInfo = this.db.pragma('table_info(trade_journal)');
      const columnNames = new Set(tableInfo.map((c) => c.name));
      if (!columnNames.has('stoch_k')) {
        this.db.exec('ALTER TABLE trade_journal ADD COLUMN stoch_k REAL');
      }
      if (!columnNames.has('stoch_d')) {
        this.db.exec('ALTER TABLE trade_journal ADD COLUMN stoch_d REAL');
      }
      if (!columnNames.has('macro_tf')) {
        this.db.exec('ALTER TABLE trade_journal ADD COLUMN macro_tf TEXT');
      }
      if (!columnNames.has('macro_trend')) {
        this.db.exec('ALTER TABLE trade_journal ADD COLUMN macro_trend TEXT');
      }

      console.log(`[TradeJournalDB] SQLite conectado con WAL Mode en: ${this.dbPath}`);
    } catch (err) {
      console.error(`[TradeJournalDB] Error al inicializar SQLite:`, err);
    }
  }

  /**
   * Insertar o actualizar un trade cerrado en el Trade Journal
   */
  insertTrade(t) {
    if (!this.db) return false;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO trade_journal (
          id, coin, symbol, side, entry_price, exit_price,
          stop_loss, take_profit1, take_profit2, size, capital_usd,
          leverage, pnl_usd, pnl_percent, fee_usd, net_pnl_usd,
          exit_reason, entry_time, exit_time, duration_seconds,
          is_win, execution_venue, rsi_14, stoch_k, stoch_d, atr_14, ema_trend,
          funding_rate, spread_pct, volume_24h_usd, mfe_pct, mae_pct,
          macro_tf, macro_trend
        ) VALUES (
          @id, @coin, @symbol, @side, @entry_price, @exit_price,
          @stop_loss, @take_profit1, @take_profit2, @size, @capital_usd,
          @leverage, @pnl_usd, @pnl_percent, @fee_usd, @net_pnl_usd,
          @exit_reason, @entry_time, @exit_time, @duration_seconds,
          @is_win, @execution_venue, @rsi_14, @stoch_k, @stoch_d, @atr_14, @ema_trend,
          @funding_rate, @spread_pct, @volume_24h_usd, @mfe_pct, @mae_pct,
          @macro_tf, @macro_trend
        )
        ON CONFLICT(id) DO UPDATE SET
          exit_price = excluded.exit_price,
          pnl_usd = excluded.pnl_usd,
          pnl_percent = excluded.pnl_percent,
          net_pnl_usd = excluded.net_pnl_usd,
          exit_reason = excluded.exit_reason,
          exit_time = excluded.exit_time,
          duration_seconds = excluded.duration_seconds,
          is_win = excluded.is_win;
      `);

      const fee = t.feeUSD !== undefined ? t.feeUSD : 0.05;
      const pnl = t.pnlUSD || 0;
      const netPnl = pnl - fee;

      stmt.run({
        id: t.id || `ct-${t.exitTime || Date.now()}-${t.coin}-${Math.random().toString(36).substr(2, 4)}`,
        coin: t.coin,
        symbol: t.symbol || `${t.coin}-PERP`,
        side: t.side || 'BUY',
        entry_price: t.entryPrice || 0,
        exit_price: t.exitPrice || 0,
        stop_loss: t.stopLoss || null,
        take_profit1: t.takeProfit1 || null,
        take_profit2: t.takeProfit2 || null,
        size: t.sz || t.size || 1,
        capital_usd: t.capitalUSD || 10,
        leverage: t.leverage || 10,
        pnl_usd: pnl,
        pnl_percent: t.pnlPercent || 0,
        fee_usd: fee,
        net_pnl_usd: netPnl,
        exit_reason: t.exitReason || 'TP/SL',
        entry_time: t.entryTime || (t.exitTime ? t.exitTime - 30000 : Date.now()),
        exit_time: t.exitTime || Date.now(),
        duration_seconds: t.durationSeconds || 0,
        is_win: t.isWin ? 1 : 0,
        execution_venue: t.executionVenue || 'DITTO_NETWORK',
        rsi_14: t.rsi14 !== undefined ? t.rsi14 : (t.rsi !== undefined ? t.rsi : null),
        stoch_k: t.stochK !== undefined ? t.stochK : (t.stoch_k !== undefined ? t.stoch_k : null),
        stoch_d: t.stochD !== undefined ? t.stochD : (t.stoch_d !== undefined ? t.stoch_d : null),
        atr_14: t.atr14 !== undefined ? t.atr14 : (t.atr !== undefined ? t.atr : null),
        ema_trend: t.emaTrend || null,
        funding_rate: t.fundingRate !== undefined ? t.fundingRate : null,
        spread_pct: t.spreadPct !== undefined ? t.spreadPct : null,
        volume_24h_usd: t.volume24hUSD !== undefined ? t.volume24hUSD : null,
        mfe_pct: t.mfePct || null,
        mae_pct: t.maePct || null,
        macro_tf: t.macroTf || t.macro_tf || null,
        macro_trend: t.macroTrend || t.macro_trend || null,
      });
      return true;
    } catch (err) {
      console.error(`[TradeJournalDB] Error al insertar trade:`, err);
      return false;
    }
  }

  /**
   * Obtener operaciones cerradas con filtros opcionales y paginación
   */
  getClosedTrades({ limit = 300, offset = 0, coin = null, isWin = null } = {}) {
    if (!this.db) return [];
    try {
      let query = `SELECT * FROM trade_journal WHERE 1=1`;
      const params = {};

      if (coin) {
        query += ` AND coin = @coin`;
        params.coin = coin.toUpperCase();
      }
      if (isWin !== null && isWin !== undefined) {
        query += ` AND is_win = @isWin`;
        params.isWin = isWin ? 1 : 0;
      }

      query += ` ORDER BY exit_time DESC LIMIT @limit OFFSET @offset`;
      params.limit = limit;
      params.offset = offset;

      const rows = this.db.prepare(query).all(params);
      return rows.map((r) => ({
        id: r.id,
        coin: r.coin,
        symbol: r.symbol,
        side: r.side,
        entryPrice: r.entry_price,
        exitPrice: r.exit_price,
        stopLoss: r.stop_loss,
        takeProfit1: r.take_profit1,
        takeProfit2: r.take_profit2,
        size: r.size,
        sz: r.size,
        capitalUSD: r.capital_usd,
        leverage: r.leverage,
        pnlUSD: r.pnl_usd,
        closedPnlUSD: r.pnl_usd,
        pnlPercent: r.pnl_percent,
        feeUSD: r.fee_usd,
        netPnlUSD: r.net_pnl_usd,
        exitReason: r.exit_reason,
        entryTime: r.entry_time,
        exitTime: r.exit_time,
        time: r.exit_time,
        durationSeconds: r.duration_seconds,
        isWin: Boolean(r.is_win),
        executionVenue: r.execution_venue,
        rsi14: r.rsi_14,
        stochK: r.stoch_k,
        stochD: r.stoch_d,
        atr14: r.atr_14,
        emaTrend: r.ema_trend,
        fundingRate: r.funding_rate,
        spreadPct: r.spread_pct,
        volume24hUSD: r.volume_24h_usd,
        mfePct: r.mfe_pct,
        maePct: r.mae_pct,
        macroTf: r.macro_tf,
        macroTrend: r.macro_trend,
      }));
    } catch (err) {
      console.error(`[TradeJournalDB] Error al consultar trades:`, err);
      return [];
    }
  }

  /**
   * Resumen analítico y estadísticas de rendimiento
   */
  getAnalytics() {
    if (!this.db) {
      return { total: 0, wins: 0, losses: 0, winRate: 0, grossWins: 0, grossLosses: 0, netDiff: 0, profitFactor: 0 };
    }
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN is_win = 0 THEN 1 ELSE 0 END) as losses,
          SUM(CASE WHEN is_win = 1 THEN pnl_usd ELSE 0 END) as gross_wins,
          SUM(CASE WHEN is_win = 0 THEN ABS(pnl_usd) ELSE 0 END) as gross_losses,
          SUM(pnl_usd) as net_pnl,
          SUM(fee_usd) as total_fees,
          AVG(CASE WHEN is_win = 1 THEN pnl_usd ELSE NULL END) as avg_win,
          AVG(CASE WHEN is_win = 0 THEN ABS(pnl_usd) ELSE NULL END) as avg_loss
        FROM trade_journal
      `).get();

      const total = stats.total || 0;
      const wins = stats.wins || 0;
      const losses = stats.losses || 0;
      const grossWins = stats.gross_wins || 0;
      const grossLosses = stats.gross_losses || 0;
      const netPnl = stats.net_pnl || 0;
      const totalFees = stats.total_fees || 0;
      const winRate = total > 0 ? (wins / total) * 100 : 0;
      const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0;

      return {
        total,
        wins,
        losses,
        winRate: Number(winRate.toFixed(2)),
        grossWins: Number(grossWins.toFixed(2)),
        grossLosses: Number(grossLosses.toFixed(2)),
        netPnl: Number(netPnl.toFixed(2)),
        totalFees: Number(totalFees.toFixed(4)),
        netAfterFees: Number((netPnl - totalFees).toFixed(2)),
        avgWin: Number((stats.avg_win || 0).toFixed(2)),
        avgLoss: Number((stats.avg_loss || 0).toFixed(2)),
        profitFactor: Number(profitFactor.toFixed(2)),
      };
    } catch (err) {
      console.error(`[TradeJournalDB] Error al obtener analíticas:`, err);
      return {};
    }
  }

  /**
   * Migración inicial de bot-state.json a SQLite si existen datos previos
   */
  migrateFromStateFile(statePath) {
    if (!this.db) return 0;
    try {
      if (!fs.existsSync(statePath)) return 0;
      const raw = fs.readFileSync(statePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.closedTrades) || parsed.closedTrades.length === 0) return 0;

      const count = this.db.prepare('SELECT COUNT(*) as cnt FROM trade_journal').get().cnt;
      if (count > 0) {
        console.log(`[TradeJournalDB] Base de datos ya contiene ${count} registros. Migrando únicamente faltantes...`);
      }

      let inserted = 0;
      const insertMany = this.db.transaction((trades) => {
        for (const t of trades) {
          if (this.insertTrade(t)) inserted++;
        }
      });

      insertMany(parsed.closedTrades);
      console.log(`[TradeJournalDB] Migración completada: ${inserted} trades procesados en SQLite.`);
      return inserted;
    } catch (err) {
      console.warn(`[TradeJournalDB] Nota sobre migración:`, err.message);
      return 0;
    }
  }

  /**
   * Sincronizar fills on-chain directamente desde Hyperliquid L1
   */
  importOnChainFills(fills) {
    if (!this.db || !Array.isArray(fills)) return 0;
    try {
      const closedFills = fills.filter(
        (f) =>
          (f.dir && f.dir.toLowerCase().includes('close')) ||
          (f.closedPnl && parseFloat(f.closedPnl) !== 0)
      );

      let count = 0;
      const insertMany = this.db.transaction((items) => {
        for (const f of items) {
          const px = parseFloat(f.px || '0');
          const sz = parseFloat(f.sz || '0');
          const notionalUSD = px * sz;
          const closedPnlUSD = parseFloat(f.closedPnl || '0');
          const feeUSD = parseFloat(f.fee || '0.05');
          const side = f.side === 'B' ? 'BUY' : 'SELL';
          const isWin = closedPnlUSD > 0;
          const pnlPercent = notionalUSD > 0 ? (closedPnlUSD / notionalUSD) * 100 : 0;

          let exitReason = 'Cierre On-Chain';
          if (f.dir) {
            if (f.dir.toLowerCase().includes('short')) exitReason = 'Cierre de Corto (Short)';
            else if (f.dir.toLowerCase().includes('long')) exitReason = 'Cierre de Largo (Long)';
          }

          const tid = f.tid || f.oid || `${f.time}-${Math.random().toString(36).substr(2, 4)}`;
          const id = `hl-fill-${tid}-${f.time}`;

          const trade = {
            id,
            coin: f.coin,
            symbol: `${f.coin}-PERP`,
            side,
            entryPrice: px,
            exitPrice: px,
            size: sz,
            capitalUSD: notionalUSD > 0 ? notionalUSD / 10 : 10,
            leverage: 10,
            pnlUSD: closedPnlUSD,
            pnlPercent,
            feeUSD,
            exitReason,
            entryTime: f.time - 30000,
            exitTime: f.time,
            durationSeconds: 30,
            isWin,
            executionVenue: 'HYPERLIQUID_ONCHAIN',
          };
          if (this.insertTrade(trade)) count++;
        }
      });

      insertMany(closedFills);
      console.log(`[TradeJournalDB] Sincronizados ${count} fills on-chain a SQLite.`);
      return count;
    } catch (err) {
      console.error(`[TradeJournalDB] Error importando fills on-chain:`, err);
      return 0;
    }
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (_) {}
      this.db = null;
    }
  }
}
