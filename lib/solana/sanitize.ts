const characterMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;'
};

export function sanitizeText(input: string): string {
  return input.replace(/[&<>"'/]/g, (character) => characterMap[character] ?? character);
}
