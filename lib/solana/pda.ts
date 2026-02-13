const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const derivePda = async (seeds: string[], programId: string): Promise<string> => {
  const chunks = [programId, ...seeds].map((seed) => encode(seed));
  const merged = new Uint8Array(chunks.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const piece of chunks) {
    merged.set(piece, offset);
    offset += piece.length;
  }
  const hashBuffer = await crypto.subtle.digest("SHA-256", merged.buffer);
  return toHex(new Uint8Array(hashBuffer)).slice(0, 64);
};

export const gamePda = (matchId: string, programId: string): Promise<string> =>
  derivePda(["game", matchId], programId);

export const lobbyPda = (matchId: string, programId: string): Promise<string> =>
  derivePda(["lobby", matchId], programId);
