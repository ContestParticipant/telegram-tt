import { ApiMessageEntityTypes } from '../../api/types';

import {
  entriesToHtml, type Entry, type Text,
} from './common';

export function parseCommonEntities(text: string) {
  text = parseCommonEntity(text, '**', 'b');
  text = parseCommonEntity(text, '__', 'i');
  text = parseCommonEntity(text, '~~', 's');
  text = parseCommonEntity(text, '||', 'span', `data-entity-type="${ApiMessageEntityTypes.Spoiler}"`);
  return text;
}

function parseCommonEntity(text: string, entitySyntax: string, tagName: string, attributes?: string) {
  const entries = new Array<Entry>();
  const lines = text.split('\n');
  let opening = true;

  for (let i = 0; i < lines.length; ++i) {
    let line = lines[i];
    const canPushNewLine = i !== lines.length - 1;
    if (opening) {
      while (line.includes(entitySyntax)) {
        const firstIndex = line.indexOf(entitySyntax);
        const nextIndex = line.indexOf(entitySyntax, firstIndex + entitySyntax.length);
        if (nextIndex === -1) {
          break;
        }
        if (firstIndex !== 0) {
          entries.push({ type: 'text', text: line.slice(0, firstIndex) });
          line = line.slice(firstIndex);
          continue;
        }
        entries.push({ type: 'openingTag' });
        entries.push({ type: 'text', text: line.slice(entitySyntax.length, nextIndex) });
        entries.push({ type: 'closingTag' });
        line = line.slice(nextIndex + entitySyntax.length);
      }

      if (!line && canPushNewLine) {
        entries.push({ type: 'text', text: '\n' });
        continue;
      }
    }
    if (!line) {
      continue;
    }

    const syntaxIndex = line.indexOf(entitySyntax);
    if (syntaxIndex === -1) {
      entries.push({ type: 'text', text: line });
      if (canPushNewLine) {
        entries.push({ type: 'text', text: '\n' });
      }
      continue;
    }
    if (syntaxIndex !== 0) {
      entries.push({ type: 'text', text: line.slice(0, syntaxIndex) });
    }
    line = line.slice(syntaxIndex);
    if (opening) {
      entries.push({ type: 'openingTag' });
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
    (openingTag as Text).text = entitySyntax;
  }

  return entriesToHtml(entries, tagName, attributes);
}
