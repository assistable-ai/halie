// Humanizer: makes output text like a real person.
// - splits long replies into natural texting chunks
// - probabilistic typo + correction pattern ("uou" then "you*")
const TYPO_MAP = {
  you: ['uou', 'yoi', 'tou'], the: ['teh', 'thw'], for: ['fir', 'fot'],
  that: ['taht', 'thst'], with: ['wjth', 'wuth'], have: ['hvae', 'hve'],
  and: ['nad', 'ajd'], this: ['thjs', 'tis'], just: ['jsut', 'jst'],
  like: ['ljke', 'liek'], what: ['waht', 'whst'], get: ['gte', 'ge5'],
  about: ['abuot', 'anout'], from: ['frmo', 'form'], good: ['giod', 'goo']
};

export function humanize(text, { typoChance = 0.12, chunk = true } = {}) {
  let parts = [];

  if (chunk) {
    // split on sentence boundaries, merge into small bursts of 1-2 short sentences
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > 60 && buf) { parts.push(buf.trim()); buf = s; }
      else buf += s;
    }
    if (buf.trim()) parts.push(buf.trim());
  } else parts = [text];

  // typo pass: pick one part, typo one word, follow with a correction message
  if (Math.random() < typoChance && parts.length) {
    const idx = Math.floor(Math.random() * parts.length);
    const words = parts[idx].split(/\b/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].toLowerCase();
      if (TYPO_MAP[w] && Math.random() < 0.9) {
        const wrong = TYPO_MAP[w][Math.floor(Math.random() * TYPO_MAP[w].length)];
        words[i] = words[i].replace(new RegExp(w, 'i'), wrong);
        parts[idx] = words.join('');
        // insert correction right after this part
        parts.splice(idx + 1, 0, words[i].replace(wrong, w) + '*');
        break;
      }
    }
  }

  // strip trailing periods (keep ! and ?), like real texting
  return parts.filter(p => p && p.trim()).map(p => p.trim().replace(/\.$/, '').replace(/\.{2,}$/, '...'));
}
