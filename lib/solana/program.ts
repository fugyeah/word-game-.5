import { actionInputSchema } from "@/features/game/schema/validators";
import { WORD_GAME_IDL } from "@/lib/solana/idl";
import { ActionResult, ProgramActionInput } from "@/types/word-game";

export interface ProgramClient {
  endpoint: string;
  sendInstruction: (instructionName: "claim" | "cancel" | "forfeit" | "retryRoll", input: ProgramActionInput) => Promise<ActionResult>;
}

const simulateNetwork = async (): Promise<void> => {
  const latency = 250 + Math.floor(Math.random() * 700);
  await new Promise((resolve) => setTimeout(resolve, latency));
};

const buildInstructionPayload = (instructionName: "claim" | "cancel" | "forfeit" | "retryRoll", input: ProgramActionInput): string => {
  const instruction = WORD_GAME_IDL.instructions.find((item) => item.name === instructionName);
  if (!instruction) {
    throw new Error("Instruction unavailable");
  }
  return Buffer.from(
    JSON.stringify({
      discriminator: instruction.discriminator,
      args: { matchId: input.matchId },
      signer: input.wallet,
    }),
  ).toString("base64");
};

export const createProgramClient = (endpoint: string): ProgramClient => ({
  endpoint,
  sendInstruction: async (instructionName, input) => {
    const parsed = actionInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        code: "validation_error",
        message: parsed.error.errors.map((item) => item.message).join(", "),
      };
    }

    await simulateNetwork();

    if (input.wallet.endsWith("1111")) {
      return {
        ok: false,
        code: "authorization_error",
        message: "Wallet lacks required signer permissions",
      };
    }

    if (Math.random() < 0.12) {
      return {
        ok: false,
        code: "network_error",
        message: "RPC temporarily unreachable",
      };
    }

    const tx = buildInstructionPayload(instructionName, input);
    return {
      ok: true,
      code: "ok",
      message: `${instructionName} submitted successfully`,
      txSignature: `${instructionName}-${tx.slice(0, 16)}`,
    };
  },
});
