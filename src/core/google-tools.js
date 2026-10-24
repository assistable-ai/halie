// Google Calendar + Gmail tools, backed by the local connections vault.
import { isConnected, getValidToken } from './connections.js';

export const GOOGLE_TOOLS = [
  { type: 'function', function: { name: 'calendar_today', description: 'Get calendar events for today (or a given date YYYY-MM-DD). Requires google connection.', parameters: { type: 'object', properties: { date: { type: 'string' } }, required: [] } } },
  { type: 'function', function: { name: 'gmail_recent', description: 'Get recent unread emails (sender, subject, snippet). Requires google connection.', parameters: { type: 'object', properties: { max: { type: 'number' } }, required: [] } } }
];

async function gapi(path, init) {
  const token = await getValidToken('google');
  if (!token) throw new Error('google not connected. tell the user to say: connect google');
  const r = await fetch('https://www.googleapis.com' + path, { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (r.status === 401) throw new Error('google token expired, needs reconnect (say: connect google)');
  if (!r.ok) throw new Error('google api ' + r.status + ': ' + (await r.text()).slice(0, 150));
  return r.json();
}

export async function runGoogleTool(name, args) {
  if (!isConnected('google')) throw new Error('google not connected. tell the user to say: connect google');
  if (name === 'calendar_today') {
    const date = args.date || new Date().toISOString().slice(0, 10);
    const next = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const d = await gapi('/calendar/v3/calendars/primary/events?timeMin=' + date + 'T00:00:00Z&timeMax=' + (args.date ? args.date : next) + 'T00:00:00Z&maxResults=20&orderBy=startTime&singleEvents=true');
    const items = (d.items || []).map(e => (e.start?.dateTime || e.start?.date || '?').slice(0, 16) + ' ' + (e.summary || '(no title)'));
    return items.length ? items.join('\n') : 'no events that day';
  }
  if (name === 'gmail_recent') {
    const d = await gapi('/gmail/v1/users/me/messages?q=is:unread&maxResults=' + (args.max || 5));
    const msgs = await Promise.all((d.messages || []).slice(0, args.max || 5).map(async m => {
      const full = await gapi('/gmail/v1/users/me/messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject');
      const from = full.payload?.headers?.find(h => h.name === 'From')?.value || '?';
      const subj = full.payload?.headers?.find(h => h.name === 'Subject')?.value || '(no subject)';
      const snippet = full.snippet || '';
      return '- ' + from.split('<')[0].trim() + ': ' + subj + ' | ' + snippet.slice(0, 120);
    }));
    return msgs.length ? msgs.join('\n') : 'inbox zero, nothing unread';
  }
  throw new Error('unknown google tool ' + name);
}
