'use strict';
// Cargador mínimo de .env (sin dependencias). No sobreescribe variables ya definidas.
const fs = require('fs');
const path = require('path');

let loaded = false;
function loadEnv(file = path.join(__dirname, '..', '.env')) {
  if (loaded) return;
  loaded = true;
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** Devuelve la clave de ejecución desde el entorno: DITTO_API_KEY tiene prioridad sobre PRIVATE_KEY. */
function getAgentKey() {
  loadEnv();
  const ditto = (process.env.DITTO_API_KEY || '').trim();
  if (ditto) return ditto;
  let pk = (process.env.PRIVATE_KEY || '').trim();
  if (pk && !pk.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(pk)) pk = '0x' + pk;
  return pk;
}

module.exports = { loadEnv, getAgentKey };
