import { WORD_GAME_IDL, WordGameIdlAccount } from "@/lib/solana/idl";
import { GameState, LobbyState, StashEntry } from "@/types/word-game";

interface EncodedAccount {
  data: string;
}

interface DecodedWithDiscriminator {
  discriminator: string;
  values: Record<string, unknown>;
}

const decodeBase64Json = (encoded: string): DecodedWithDiscriminator => {
  const plain = Buffer.from(encoded, "base64").toString("utf-8");
  const parsed = JSON.parse(plain) as Record<string, unknown>;
  if (typeof parsed.discriminator !== "string" || typeof parsed.values !== "object" || !parsed.values) {
    throw new Error("Invalid account envelope");
  }
  return {
    discriminator: parsed.discriminator,
    values: parsed.values as Record<string, unknown>,
  };
};

const accountSchema = (discriminator: string): WordGameIdlAccount => {
  const account = WORD_GAME_IDL.accounts.find((item) => item.discriminator === discriminator);
  if (!account) {
    throw new Error("Unknown discriminator");
  }
  return account;
};

const assertByIdl = (schema: WordGameIdlAccount, values: Record<string, unknown>): Record<string, unknown> => {
  for (const field of schema.fields) {
    if (!(field.name in values)) {
      throw new Error(`Missing field ${field.name}`);
    }
  }
  return values;
};

export const decodeLobby = (account: EncodedAccount): LobbyState => {
  const envelope = decodeBase64Json(account.data);
  const schema = accountSchema(envelope.discriminator);
  if (schema.name !== "lobby") {
    throw new Error("Not a lobby account");
  }
  const values = assertByIdl(schema, envelope.values);
  return {
    id: String(values.id),
    host: String(values.host),
    challenger: values.challenger ? String(values.challenger) : null,
    status: String(values.status) as LobbyState["status"],
    createdAt: Number(values.createdAt),
    wagerLamports: String(values.wagerLamports),
  };
};

export const decodeGame = (account: EncodedAccount): GameState => {
  const envelope = decodeBase64Json(account.data);
  const schema = accountSchema(envelope.discriminator);
  if (schema.name !== "game") {
    throw new Error("Not a game account");
  }
  const values = assertByIdl(schema, envelope.values);
  return {
    id: String(values.id),
    lobbyId: String(values.lobbyId),
    host: String(values.host),
    challenger: String(values.challenger),
    turnOwner: String(values.turnOwner),
    hostRoll: Number(values.hostRoll) || null,
    challengerRoll: Number(values.challengerRoll) || null,
    winner: values.winner ? String(values.winner) : null,
    status: String(values.status) as GameState["status"],
    countdown: {
      claimExpiresAt: Date.now() + 30_000,
      cancelExpiresAt: Date.now() + 15_000,
      forfeitExpiresAt: Date.now() + 45_000,
      rerollAvailableAt: Date.now() + 10_000,
    },
    updatedAt: Number(values.updatedAt),
  };
};

export const decodeStash = (account: EncodedAccount): StashEntry => {
  const envelope = decodeBase64Json(account.data);
  const schema = accountSchema(envelope.discriminator);
  if (schema.name !== "stash") {
    throw new Error("Not a stash account");
  }
  const values = assertByIdl(schema, envelope.values);
  return {
    mint: String(values.mint),
    amount: String(values.amount),
    symbol: String(values.symbol),
    updatedAt: Number(values.updatedAt),
  };
};
