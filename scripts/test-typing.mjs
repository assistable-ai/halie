import { readFileSync } from 'fs';
const t = readFileSync('.env', 'utf8').match(/HALIE_TELEGRAM_TOKEN=(.*)/)[1].trim();
const r = await fetch('https://api.telegram.org/bot' + t + '/sendChatAction', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: 8372761798, action: 'typing' })
});
console.log(await r.text());
