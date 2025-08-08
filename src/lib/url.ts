export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  const u = new URL(url);
  u.hash = "";
  return u.toString();
}
