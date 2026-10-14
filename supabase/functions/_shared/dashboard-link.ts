export function dashboardLink(base: string, code: string | null | undefined): string {
  if (!base || !code?.trim()) return '';
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid dashboard URL');
  url.searchParams.set('code', code.trim());
  return url.toString();
}
