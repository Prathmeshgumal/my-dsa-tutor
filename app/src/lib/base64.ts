export function encodeBase64(s: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(s)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeBase64(s: string | null): string {
  if (!s) return ''
  const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
