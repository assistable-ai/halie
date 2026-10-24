import { readFileSync } from 'node:fs';
// load .env if present (launchd doesn't read it for us)
try { for (const l of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); } } catch {}
const TOKEN = process.env.HALIE_TELEGRAM_TOKEN;
if (!TOKEN) { console.error('Set HALIE_TELEGRAM_TOKEN'); process.exit(1); }
const API = 'https://api.telegram.org/bot' + TOKEN;

const { chatTurn, remember } = await import('../core/chat.js');
const { runTask } = await import('../core/loop.js');
const { humanize } = await import('../core/humanize.js');

async function tg(method, body) {
  const res = await fetch(API + '/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function typingLoop(chatId) {
  let on = true;
  (async () => { while (on) { const r = await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(e => ({ err: String(e).slice(0,100) })); if (r && r.err) console.error('typing failed:', r.err); await new Promise(r => setTimeout(r, 4500)); } })();
  return () => { on = false; };
}

// send a humanized multi-part reply with natural delays
async function sendHuman(chatId, replyTo, text) {
  const parts = humanize(String(text || '...'));
  for (let i = 0; i < parts.length; i++) {
    await tg('sendMessage', { chat_id: chatId, text: parts[i], reply_to_message_id: i === 0 ? replyTo : undefined });
    if (i < parts.length - 1) await new Promise(r => setTimeout(r, 700 + Math.random() * 1300));
  }
}

const queue = [];
let busy = false;
const lastReacted = {};

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    try { await job(); } catch (e) { console.error('job error:', e.message); }
  }
  busy = false;
}

async function handle(msg) {
  const uid = String(msg.from.id);
  if (msg.text.startsWith('/')) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: "hey! I'm Halie, running locally on the mini. Talk to me normally or give me a task (check disk space, read a file, etc)" });
    return;
  }
  console.log('-> msg:', msg.text);

  // 1) handshake: clear previous reaction, EYES on this one = "received, working"
  if (lastReacted[msg.chat.id] && lastReacted[msg.chat.id] !== msg.message_id) {
    await tg('setMessageReaction', { chat_id: msg.chat.id, message_id: lastReacted[msg.chat.id], reaction: [] }).catch(() => null);
  }
  lastReacted[msg.chat.id] = msg.message_id;
  await tg('setMessageReaction', { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '👀' }] }).catch(e => console.error('react failed:', JSON.stringify(e).slice(0,150)));

  const stopTyping = typingLoop(msg.chat.id);

  try {
    const { reply, taskQuery } = await chatTurn(uid, msg.text);
    if (taskQuery) {
      const ACKS = ['sure, give me one sec', 'on it, one sec', 'yea give me a sec', 'ok checking now', 'say less, one sec', 'yep gimme a sec'];
      if (reply && reply.trim()) await sendHuman(msg.chat.id, msg.message_id, reply);
      else await sendHuman(msg.chat.id, msg.message_id, ACKS[Math.floor(Math.random() * ACKS.length)]);
      let answer = null, lastErr = null;
      for (let attempt = 0; attempt < 2 && !answer; attempt++) {
        try {
          const res = await runTask(taskQuery, {
            tasksDir: './tasks',
            onProgress: (phase, t) => console.log('  [' + phase + '] step ' + (t.current + 1) + '/' + (t.steps?.length || '?'))
          });
          answer = res.answer;
        } catch (e) {
          lastErr = e;
          console.error('task attempt ' + (attempt + 1) + ' failed:', e.message);
          await tg('setMessageReaction', { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '⚠️' }] }).catch(() => null);
        }
      }
      if (answer) {
        remember(uid, 'assistant', 'task result: ' + String(answer).slice(0, 400));
        await sendHuman(msg.chat.id, msg.message_id, answer);
      } else {
        await sendHuman(msg.chat.id, msg.message_id, 'ugh, that one broke twice. ' + String(lastErr?.message || '').slice(0, 120));
        await tg('setMessageReaction', { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '❌' }] }).catch(() => null);
        return;
      }
    } else {
      await sendHuman(msg.chat.id, msg.message_id, reply || '...');
    }
  } catch (e) {
    console.error('turn failed:', e.message);
    await tg('setMessageReaction', { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '❌' }] }).catch(() => null);
    await sendHuman(msg.chat.id, msg.message_id, 'hmm, that broke: ' + String(e.message).slice(0, 150));
  } finally {
    stopTyping();
    await tg('setMessageReaction', { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] }).catch(() => null);
  }
}

let offset = 0;
console.log('Halie Telegram gateway up. Polling...');

while (true) {
  try {
    const updates = await (await fetch(API + '/getUpdates?timeout=30&offset=' + offset)).json();
    if (!updates.ok) console.error('poll not-ok:', JSON.stringify(updates).slice(0, 200));
    else if ((updates.result || []).length) console.log('poll got', updates.result.length, 'updates @', new Date().toISOString());
    for (const u of updates.result || []) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg || !msg.text) continue;
      const ALLOWED = new Set(['8372761798']);
      if (ALLOWED.size && !ALLOWED.has(String(msg.from.id))) {
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Not authorized.' });
        continue;
      }
      queue.push(() => handle(msg));
      drain();
    }
  } catch (e) {
    console.error('poll error:', e.message);
    await new Promise(r => setTimeout(r, 3000));
  }
}
