/** Format display text only. This never marks OCR as validated or produces policy facts. */
export function readableDocumentText(value: string): string {
  let text = value.trim();
  if (/^[\[{]/.test(text)) {
    try {
      const parsed: unknown = JSON.parse(text);
      const collect = (node: unknown): string[] => {
        if (Array.isArray(node)) return node.flatMap(collect);
        if (node && typeof node === 'object') {
          const object = node as Record<string, unknown>;
          for (const key of ['text', 'tekst', 'content', 'extractedText']) {
            if (typeof object[key] === 'string') return [object[key] as string];
          }
          for (const key of ['fragments', 'pages', 'documents', 'paragraphs']) {
            if (Array.isArray(object[key])) return collect(object[key]);
          }
        }
        return [];
      };
      const paragraphs = collect(parsed);
      if (!paragraphs.length) return 'Geen leesbare tekst beschikbaar. Controleer het oorspronkelijke document.';
      text = paragraphs.join('\n\n');
    } catch {
      return 'De herkende tekst kon niet leesbaar worden weergegeven. Controleer het oorspronkelijke document.';
    }
  }
  return text.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n');
}
