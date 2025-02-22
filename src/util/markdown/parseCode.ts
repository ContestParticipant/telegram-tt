import { entriesToHtml, type Entry } from './common';

const CODE = '`';

export function parseCode(text: string) {
  const entries = new Array<Entry>();
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; ++i) {
    let line = lines[i];
    const canPushNewLine = i !== lines.length - 1;
    while (line.includes(CODE)) {
      const firstIndex = line.indexOf(CODE);
      const nextIndex = line.indexOf(CODE, firstIndex + 1);
      if (nextIndex === -1) {
        break;
      }
      if (firstIndex !== 0) {
        entries.push({ type: 'text', text: line.slice(0, firstIndex) });
        line = line.slice(firstIndex);
        continue;
      }
      entries.push({ type: 'openingTag' });
      entries.push({ type: 'text', text: line.slice(1, nextIndex) });
      entries.push({ type: 'closingTag' });
      line = line.slice(nextIndex + 1);
    }
    if (line) {
      entries.push({ type: 'text', text: line });
    }
    if (canPushNewLine) {
      entries.push({ type: 'text', text: '\n' });
    }
  }

  return entriesToHtml(entries, 'code');
}
