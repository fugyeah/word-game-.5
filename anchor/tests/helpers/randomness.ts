export interface DeterministicRng {
  nextDie(): number;
  reset(seed?: number): void;
  readonly seed: number;
}

const DEFAULT_SEED = 0x0bad5eed;

const createLcg = (initialSeed: number): DeterministicRng => {
  let state = initialSeed >>> 0;

  const nextU32 = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };

  return {
    nextDie(): number {
      return (nextU32() % 6) + 1;
    },
    reset(seed?: number): void {
      state = (seed ?? initialSeed) >>> 0;
    },
    get seed(): number {
      return state;
    }
  };
};

const isProductionBuild = (): boolean => {
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const appEnv = (process.env.APP_ENV ?? "").toLowerCase();
  return nodeEnv === "production" || appEnv === "production";
};

const hasTestOnlyFlag = (): boolean => process.env.ENABLE_TEST_ONLY_RANDOMNESS === "1";

export const createDeterministicRng = (seed: number = DEFAULT_SEED): DeterministicRng => {
  if (isProductionBuild()) {
    throw new Error("Deterministic RNG is disabled for production builds.");
  }

  if (!hasTestOnlyFlag()) {
    throw new Error("ENABLE_TEST_ONLY_RANDOMNESS=1 is required for deterministic RNG.");
  }

  return createLcg(seed >>> 0);
};

export const createProductionSafeRng = (): (() => number) => {
  if (hasTestOnlyFlag() && isProductionBuild()) {
    throw new Error("ENABLE_TEST_ONLY_RANDOMNESS must not be set for production builds.");
  }

  return (): number => Math.floor(Math.random() * 6) + 1;
};
