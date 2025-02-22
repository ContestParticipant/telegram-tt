export interface OpeningTag {
  type: 'openingTag';
  language?: string;
}

export interface Text {
  type: 'text';
  text: string;
}

export interface ClosingTag {
  type: 'closingTag';
}

export type Entry = OpeningTag | Text | ClosingTag;

export function entriesToHtml(entries: Entry[], tag: string, attributes?: string) {
  attributes = attributes ? ` ${attributes}` : '';
  let html = '';
  for (const entry of entries) {
    switch (entry.type) {
      case 'openingTag':
        html += `<${tag}${attributes}>`;
        break;
      case 'text':
        html += entry.text;
        break;
      case 'closingTag':
        html += `</${tag}>`;
        break;
    }
  }
  return html;
}
