export function renderPage(source: { title: string; description: string }, content: string): string {
  return [
    '---',
    `title: "${source.title}"`,
    `description: "${source.description}"`,
    '---',
    '',
    content,
  ].join('\n');
}
