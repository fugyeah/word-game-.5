import { createProgramClient } from "@/lib/solana/program";
import { ActionResult, ProgramActionInput } from "@/types/word-game";

const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const client = createProgramClient(endpoint);

const submit = async (
  instruction: "claim" | "cancel" | "forfeit" | "retryRoll",
  input: ProgramActionInput,
): Promise<ActionResult> => {
  try {
    const result = await client.sendInstruction(instruction, input);
    if (!result.ok) {
      return result;
    }
    return result;
  } catch {
    return {
      ok: false,
      code: "network_error",
      message: "Unexpected transport failure while submitting transaction",
    };
  }
};

export const claim = (input: ProgramActionInput): Promise<ActionResult> => submit("claim", input);

export const cancel = (input: ProgramActionInput): Promise<ActionResult> => submit("cancel", input);

export const forfeit = (input: ProgramActionInput): Promise<ActionResult> => submit("forfeit", input);

export const retryRoll = (input: ProgramActionInput): Promise<ActionResult> => submit("retryRoll", input);
