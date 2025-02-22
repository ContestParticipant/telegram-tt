import type { Entry, OpeningTag, Text } from './common';

const PRE = '```';

export function parsePre(text: string) {
  const entries = new Array<Entry>();
  const lines = text.split('\n');
  let opening = true;

  for (let i = 0; i < lines.length; ++i) {
    let line = lines[i];
    const canPushNewLine = i !== lines.length - 1;
    const preIndex = line.indexOf(PRE);
    if (preIndex === -1) {
      entries.push({ type: 'text', text: line });
      if (canPushNewLine) {
        entries.push({ type: 'text', text: '\n' });
      }
      continue;
    }
    if (preIndex !== 0) {
      entries.push({ type: 'text', text: line.slice(0, preIndex) });
    }
    line = line.slice(preIndex);
    if (opening) {
      const language = line.slice(PRE.length);
      if (language && language.endsWith(PRE)) {
        entries.push({ type: 'openingTag' });
        entries.push({ type: 'text', text: language.slice(0, language.length - PRE.length) });
        entries.push({ type: 'closingTag' });
        if (canPushNewLine) {
          entries.push({ type: 'text', text: '\n' });
        }
        continue;
      }
      entries.push({ type: 'openingTag', language });
      opening = false;
    } else {
      entries.push({ type: 'closingTag' });
      opening = true;
    }
    if (canPushNewLine) {
      entries.push({ type: 'text', text: '\n' });
    }
  }

  const openingTags = new Array<Entry>();
  for (const entry of entries) {
    if (entry.type === 'openingTag') {
      openingTags.push(entry);
    } else if (entry.type === 'closingTag') {
      openingTags.pop();
    }
  }
  for (const openingTag of openingTags) {
    openingTag.type = 'text';
    (openingTag as Text).text = PRE + ((openingTag as OpeningTag).language ?? '');
    delete (openingTag as OpeningTag).language;
  }

  let html = '';
  for (const entry of entries) {
    switch (entry.type) {
      case 'openingTag': {
        let language = entry.language;
        if (language) {
          language = language.replaceAll('"', '\\"');
          language = ` data-language="${entry.language}"`;
        }
        html += `<pre${language}>`;
        break;
      }
      case 'text':
        html += entry.text;
        break;
      case 'closingTag':
        html += '</pre>';
        break;
    }
  }

  return html;
}
