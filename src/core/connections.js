// Connections vault: OAuth tokens live on this machine only.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.HALIE_DATA || './data';
const VAULT = join(DATA_DIR, 'connections.json');

export function loadVault() {
  try { return JSON.parse(readFileSync(VAULT, 'utf8')); } catch { return {}; }
}

export function saveVault(v) { writeFileSync(VAULT, JSON.stringify(v, null, 2)); }

export function getConnection(name) { return loadVault()[name] || null; }

export function isConnected(name) {
  const c = getConnection(name);
  return !!(c && c.access_token && (!c.expiry || Date.now() < c.expiry - 60000));
}

export function setConnection(name, data) {
  const v = loadVault();
  v[name] = { ...data, connected_at: new Date().toISOString() };
  saveVault(v);
}

export function clearConnection(name) {
  const v = loadVault();
  delete v[name];
  saveVault(v);
}

export async function getValidToken(name, opts = {}) {
  const c = getConnection(name);
  if (!c) return null;
  if (c.expiry && Date.now() > c.expiry - 60000 && c.refresh_token) {
    const body = new URLSearchParams({
      client_id: opts.clientId || process.env.GOOGLE_CLIENT_ID,
      client_secret: opts.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: c.refresh_token,
      grant_type: 'refresh_token'
    });
    const r = await fetch(opts.refreshUrl || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) throw new Error('token refresh failed ' + r.status);
    const d = await r.json();
    setConnection(name, { ...c, access_token: d.access_token, expiry: Date.now() + (d.expires_in || 3600) * 1000 });
    return d.access_token;
  }
  return c.access_token || null;
}

export function connectionStatus() {
  const v = loadVault();
  return Object.entries(v).map(([k]) => k);
}
