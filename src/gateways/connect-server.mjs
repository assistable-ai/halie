// Local OAuth connect server: tokens land on this machine only.
// Usage: node src/gateways/connect-server.mjs  (runs on :3777)
import http from 'node:http';
import { setConnection, isConnected } from '../core/connections.js';
import { readFileSync } from 'node:fs';

const PORT = 3777;
const GOOGLE = {
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  redirect: 'http://localhost:3777/callback/google',
  scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'
};

const PAGE = (title, body) => '<html><head><meta charset=utf-8><title>' + title + '</title><style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#111}h1{font-size:20px}p{color:#444;line-height:1.5}</style></head><body>' + body + '</body></html>';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);

  if (url.pathname === '/connect/google') {
    if (!GOOGLE.client_id) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(PAGE('Setup needed', '<h1>Google not configured yet</h1><p>The owner needs to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first (Google Cloud Console, OAuth desktop app, calendar + gmail scopes).</p>'));
      return;
    }
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: GOOGLE.client_id,
      redirect_uri: GOOGLE.redirect,
      response_type: 'code',
      scope: GOOGLE.scopes,
      access_type: 'offline',
      prompt: 'consent'
    });
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  if (url.pathname === '/callback/google') {
    const code = url.searchParams.get('code');
    if (!code) { res.writeHead(400); res.end(PAGE('Error', '<h1>No auth code returned</h1>')); return; }
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE.client_id,
          client_secret: GOOGLE.client_secret,
          redirect_uri: GOOGLE.redirect,
          grant_type: 'authorization_code'
        })
      });
      if (!r.ok) throw new Error('token exchange failed ' + r.status);
      const d = await r.json();
      setConnection('google', {
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expiry: Date.now() + (d.expires_in || 3600) * 1000,
        scopes: GOOGLE.scopes
      });
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(PAGE('Connected', '<h1>Google connected</h1><p>Calendar and Gmail are live. You can close this window and go back to Telegram.</p>'));
      console.log('[connect] google connected');
    } catch (e) {
      res.writeHead(500);
      res.end(PAGE('Failed', '<h1>Connection failed</h1><p>' + e.message + '</p>'));
    }
    return;
  }

  if (url.pathname === '/status') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ google: isConnected('google') }));
    return;
  }

  res.writeHead(404);
  res.end(PAGE('Not found', '<h1>404</h1>'));
});

server.listen(PORT, () => console.log('Connect server on http://localhost:' + PORT));
