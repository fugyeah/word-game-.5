export interface WordGameIdlTypeField {
  name: string;
  type: "u8" | "u64" | "string" | "publicKey";
}

export interface WordGameIdlAccount {
  name: "lobby" | "game" | "stash";
  discriminator: string;
  fields: WordGameIdlTypeField[];
}

export interface WordGameIdlInstruction {
  name: "claim" | "cancel" | "forfeit" | "retryRoll";
  discriminator: string;
  args: WordGameIdlTypeField[];
}

export interface WordGameIdl {
  name: "word_game";
  version: "0.5.0";
  accounts: WordGameIdlAccount[];
  instructions: WordGameIdlInstruction[];
}

export const WORD_GAME_IDL: WordGameIdl = {
  name: "word_game",
  version: "0.5.0",
  accounts: [
    {
      name: "lobby",
      discriminator: "LOBBY001",
      fields: [
        { name: "id", type: "string" },
        { name: "host", type: "publicKey" },
        { name: "challenger", type: "publicKey" },
        { name: "status", type: "string" },
        { name: "createdAt", type: "u64" },
        { name: "wagerLamports", type: "u64" },
      ],
    },
    {
      name: "game",
      discriminator: "GAME0001",
      fields: [
        { name: "id", type: "string" },
        { name: "lobbyId", type: "string" },
        { name: "host", type: "publicKey" },
        { name: "challenger", type: "publicKey" },
        { name: "turnOwner", type: "publicKey" },
        { name: "hostRoll", type: "u8" },
        { name: "challengerRoll", type: "u8" },
        { name: "winner", type: "publicKey" },
        { name: "status", type: "string" },
        { name: "updatedAt", type: "u64" },
      ],
    },
    {
      name: "stash",
      discriminator: "STASH001",
      fields: [
        { name: "owner", type: "publicKey" },
        { name: "mint", type: "publicKey" },
        { name: "amount", type: "u64" },
        { name: "symbol", type: "string" },
        { name: "updatedAt", type: "u64" },
      ],
    },
  ],
  instructions: [
    { name: "claim", discriminator: "IXCLAIM0", args: [{ name: "matchId", type: "string" }] },
    { name: "cancel", discriminator: "IXCANCEL", args: [{ name: "matchId", type: "string" }] },
    { name: "forfeit", discriminator: "IXFORFIT", args: [{ name: "matchId", type: "string" }] },
    { name: "retryRoll", discriminator: "IXRETRY0", args: [{ name: "matchId", type: "string" }] },
  ],
};
