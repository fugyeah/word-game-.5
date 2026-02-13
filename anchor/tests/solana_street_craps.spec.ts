import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createDeterministicRng } from "./helpers/randomness";

type GameStatus =
  | "created"
  | "open"
  | "point"
  | "settled"
  | "cancelled"
  | "closed"
  | "forfeited";

interface RollResult {
  readonly dice: readonly [number, number];
  readonly total: number;
  readonly phase: "come_out" | "point";
  readonly statusAfterRoll: GameStatus;
}

interface PlayerState {
  joined: boolean;
  claimed: boolean;
  forfeit: boolean;
}

interface StreetCrapsGame {
  id: string;
  creator: string;
  betLamports: bigint;
  treasuryLamports: bigint;
  point: number | null;
  status: GameStatus;
  winner: string | null;
  loser: string | null;
  retryCount: number;
  rolls: RollResult[];
  players: Record<string, PlayerState>;
}

class StreetCrapsEngine {
  private readonly games: Map<string, StreetCrapsGame> = new Map<string, StreetCrapsGame>();
  private readonly balances: Map<string, bigint> = new Map<string, bigint>();
  private readonly rng: { nextDie: () => number };

  public constructor(rng: { nextDie: () => number }) {
    this.rng = rng;
  }

  public fund(account: string, lamports: bigint): void {
    const current = this.balanceOf(account);
    this.balances.set(account, current + lamports);
  }

  public balanceOf(account: string): bigint {
    return this.balances.get(account) ?? 0n;
  }

  public create(gameId: string, creator: string, betLamports: bigint): StreetCrapsGame {
    assert.ok(gameId.length > 2, "game id must be at least 3 chars");
    assert.ok(!this.games.has(gameId), "game id already exists");
    assert.ok(betLamports > 0n, "bet must be positive");
    this.requireSpendable(creator, betLamports);

    this.debit(creator, betLamports);

    const game: StreetCrapsGame = {
      id: gameId,
      creator,
      betLamports,
      treasuryLamports: betLamports,
      point: null,
      status: "created",
      winner: null,
      loser: null,
      retryCount: 0,
      rolls: [],
      players: {
        [creator]: { joined: true, claimed: false, forfeit: false }
      }
    };

    this.games.set(gameId, game);
    return game;
  }

  public join(gameId: string, player: string): StreetCrapsGame {
    const game = this.mustGame(gameId);
    assert.equal(game.status, "created", "game must be in created status");
    assert.notEqual(player, game.creator, "creator cannot join twice");
    assert.ok(!game.players[player], "player already joined");
    this.requireSpendable(player, game.betLamports);

    this.debit(player, game.betLamports);
    game.players[player] = { joined: true, claimed: false, forfeit: false };
    game.treasuryLamports += game.betLamports;
    game.status = "open";
    return game;
  }

  public roll(gameId: string, roller: string): RollResult {
    const game = this.mustGame(gameId);
    assert.ok(game.status === "open" || game.status === "point", "game cannot roll now");
    assert.ok(game.players[roller]?.joined, "roller must be a participant");

    const die1 = this.rng.nextDie();
    const die2 = this.rng.nextDie();
    const total = die1 + die2;
    const phase: "come_out" | "point" = game.point === null ? "come_out" : "point";

    if (phase === "come_out") {
      if (total === 7 || total === 11) {
        this.settle(game, game.creator, this.otherPlayer(game, game.creator));
      } else if (total === 2 || total === 3 || total === 12) {
        const challenger = this.otherPlayer(game, game.creator);
        this.settle(game, challenger, game.creator);
      } else {
        game.point = total;
        game.status = "point";
      }
    } else {
      assert.ok(game.point !== null, "point is required");
      if (total === game.point) {
        this.settle(game, game.creator, this.otherPlayer(game, game.creator));
      } else if (total === 7) {
        const challenger = this.otherPlayer(game, game.creator);
        this.settle(game, challenger, game.creator);
      }
    }

    const rollResult: RollResult = {
      dice: [die1, die2],
      total,
      phase,
      statusAfterRoll: game.status
    };
    game.rolls.push(rollResult);

    return rollResult;
  }

  public retry(gameId: string, actor: string): StreetCrapsGame {
    const game = this.mustGame(gameId);
    assert.equal(game.status, "settled", "retry requires settled game");
    assert.ok(game.players[actor]?.joined, "actor must be player");
    assert.ok(game.retryCount < 1, "only one retry allowed");

    game.retryCount += 1;
    game.status = "open";
    game.winner = null;
    game.loser = null;
    game.point = null;
    return game;
  }

  public settleByAdmin(gameId: string, winner: string): StreetCrapsGame {
    const game = this.mustGame(gameId);
    assert.ok(game.status === "open" || game.status === "point", "cannot settle current status");
    assert.ok(game.players[winner]?.joined, "winner must be player");
    this.settle(game, winner, this.otherPlayer(game, winner));
    return game;
  }

  public claim(gameId: string, claimant: string): bigint {
    const game = this.mustGame(gameId);
    assert.equal(game.status, "settled", "claim requires settled game");
    assert.equal(game.winner, claimant, "only winner can claim");

    const claimantState = game.players[claimant];
    assert.ok(claimantState.joined, "winner must have joined");
    assert.equal(claimantState.claimed, false, "double-claim prevented");

    claimantState.claimed = true;
    const payout = game.treasuryLamports;
    game.treasuryLamports = 0n;
    this.credit(claimant, payout);
    return payout;
  }

  public close(gameId: string, actor: string): StreetCrapsGame {
    const game = this.mustGame(gameId);
    assert.equal(actor, game.creator, "only creator can close");
    assert.ok(game.status === "settled" || game.status === "cancelled", "invalid close status");
    assert.equal(game.treasuryLamports, 0n, "treasury must be empty before close");

    game.status = "closed";
    return game;
  }

  public cancel(gameId: string, actor: string): StreetCrapsGame {
    const game = this.mustGame(gameId);
    assert.equal(actor, game.creator, "only creator can cancel");
    assert.ok(game.status === "created" || game.status === "open", "cancel only before rolling starts");

    game.status = "cancelled";
    return game;
  }

  public withdraw(gameId: string, actor: string): bigint {
    const game = this.mustGame(gameId);
    assert.equal(game.status, "cancelled", "withdraw requires cancelled game");
    const p = game.players[actor];
    assert.ok(Boolean(p?.joined), "actor must be participant");
    assert.equal(p?.claimed, false, "already withdrawn");

    p.claimed = true;
    const amount = game.betLamports;
    assert.ok(game.treasuryLamports >= amount, "treasury does not have refund amount");
    game.treasuryLamports -= amount;
    this.credit(actor, amount);
    return amount;
  }

  public forfeit(gameId: string, actor: string): StreetCrapsGame {
    const game = this.mustGame(gameId);
    assert.ok(game.status === "open" || game.status === "point", "forfeit requires active game");
    assert.ok(game.players[actor]?.joined, "forfeit actor must be player");

    const winner = this.otherPlayer(game, actor);
    game.players[actor].forfeit = true;
    this.settle(game, winner, actor);
    game.status = "forfeited";
    return game;
  }

  public game(gameId: string): StreetCrapsGame {
    return this.mustGame(gameId);
  }

  private settle(game: StreetCrapsGame, winner: string, loser: string): void {
    game.status = "settled";
    game.winner = winner;
    game.loser = loser;
    game.point = null;
  }

  private otherPlayer(game: StreetCrapsGame, excluded: string): string {
    const candidates = Object.keys(game.players).filter((p) => p !== excluded);
    assert.equal(candidates.length, 1, "expected exactly one opponent");
    return candidates[0];
  }

  private mustGame(gameId: string): StreetCrapsGame {
    const game = this.games.get(gameId);
    assert.ok(game, `game ${gameId} not found`);
    return game;
  }

  private requireSpendable(account: string, amount: bigint): void {
    assert.ok(this.balanceOf(account) >= amount, `${account} has insufficient balance`);
  }

  private debit(account: string, amount: bigint): void {
    this.balances.set(account, this.balanceOf(account) - amount);
  }

  private credit(account: string, amount: bigint): void {
    this.balances.set(account, this.balanceOf(account) + amount);
  }
}


const setNodeEnv = (value: string): void => {
  Object.assign(process.env, { NODE_ENV: value });
};

const withEngine = (seed: number = 12345): StreetCrapsEngine => {
  process.env.ENABLE_TEST_ONLY_RANDOMNESS = "1";
  setNodeEnv("test");
  const rng = createDeterministicRng(seed);
  return new StreetCrapsEngine(rng);
};

describe("solana street craps deterministic flow", () => {
  it("create: debits creator and opens created game", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    const game = engine.create("g01", "alice", 1_000n);

    assert.equal(game.status, "created");
    assert.equal(engine.balanceOf("alice"), 9_000n);
  });

  it("create rejects duplicate game id", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.create("g01", "alice", 1_000n);
    assert.throws(() => engine.create("g01", "alice", 1_000n), /already exists/);
  });

  it("join: accepts challenger and moves to open", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);

    const game = engine.join("g01", "bob");
    assert.equal(game.status, "open");
    assert.equal(game.treasuryLamports, 2_000n);
  });

  it("join rejects second join by same player", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    assert.throws(() => engine.join("g01", "bob"), /created status/);
  });

  it("roll transitions from open to point when point is established", () => {
    const engine = withEngine(123);
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    const roll = engine.roll("g01", "alice");
    assert.equal(roll.phase, "come_out");
    assert.equal(engine.game("g01").status, "point");
  });

  it("roll settles on come-out natural", () => {
    const engine = withEngine(2);
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    const roll = engine.roll("g01", "alice");
    assert.ok(roll.total === 7 || roll.total === 11);
    assert.equal(engine.game("g01").winner, "alice");
  });

  it("roll settles on come-out craps", () => {
    const engine = withEngine(19);
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    const roll = engine.roll("g01", "alice");
    assert.ok([2, 3, 12].includes(roll.total));
    assert.equal(engine.game("g01").winner, "bob");
  });

  it("retry re-opens settled game exactly once", () => {
    const engine = withEngine(2);
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");
    engine.roll("g01", "alice");

    const reopened = engine.retry("g01", "alice");
    assert.equal(reopened.status, "open");
    engine.settleByAdmin("g01", "alice");
    assert.throws(() => engine.retry("g01", "alice"), /only one retry/);
  });

  it("settleByAdmin supports explicit winner selection", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    const settled = engine.settleByAdmin("g01", "bob");
    assert.equal(settled.winner, "bob");
    assert.equal(settled.status, "settled");
  });

  it("claim transfers treasury to winner", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");
    engine.settleByAdmin("g01", "bob");

    const payout = engine.claim("g01", "bob");
    assert.equal(payout, 2_000n);
    assert.equal(engine.balanceOf("bob"), 11_000n);
  });

  it("claim prevents double claim", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");
    engine.settleByAdmin("g01", "bob");

    engine.claim("g01", "bob");
    assert.throws(() => engine.claim("g01", "bob"), /double-claim prevented/);
  });

  it("close succeeds only after funds are fully claimed", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");
    engine.settleByAdmin("g01", "bob");

    assert.throws(() => engine.close("g01", "alice"), /treasury must be empty/);
    engine.claim("g01", "bob");
    const closed = engine.close("g01", "alice");
    assert.equal(closed.status, "closed");
  });

  it("cancel allows creator to unwind before join", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.create("g01", "alice", 1_000n);

    const cancelled = engine.cancel("g01", "alice");
    assert.equal(cancelled.status, "cancelled");
    assert.equal(engine.balanceOf("alice"), 9_000n);
  });

  it("cancel rejects non-creator", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);

    assert.throws(() => engine.cancel("g01", "bob"), /only creator/);
  });

  it("withdraw returns bet after cancellation", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.cancel("g01", "alice");

    const refunded = engine.withdraw("g01", "alice");
    assert.equal(refunded, 1_000n);
    assert.equal(engine.balanceOf("alice"), 10_000n);
  });

  it("withdraw blocks duplicate withdraw", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.cancel("g01", "alice");

    engine.withdraw("g01", "alice");
    assert.throws(() => engine.withdraw("g01", "alice"), /already withdrawn/);
  });

  it("forfeit settles game in favor of opponent", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    const forfeited = engine.forfeit("g01", "bob");
    assert.equal(forfeited.status, "forfeited");
    assert.equal(forfeited.winner, "alice");
  });

  it("forfeit rejects non-participant", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.fund("carol", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    assert.throws(() => engine.forfeit("g01", "carol"), /must be player/);
  });

  it("deterministic RNG sequence is reproducible", () => {
    process.env.ENABLE_TEST_ONLY_RANDOMNESS = "1";
    setNodeEnv("test");
    const r1 = createDeterministicRng(99);
    const r2 = createDeterministicRng(99);

    const seq1 = [r1.nextDie(), r1.nextDie(), r1.nextDie(), r1.nextDie()];
    const seq2 = [r2.nextDie(), r2.nextDie(), r2.nextDie(), r2.nextDie()];

    assert.deepEqual(seq1, seq2);
  });

  it("deterministic RNG is disabled without feature flag", () => {
    delete process.env.ENABLE_TEST_ONLY_RANDOMNESS;
    setNodeEnv("test");

    assert.throws(() => createDeterministicRng(1), /required/);
  });

  it("deterministic RNG is disabled in production", () => {
    process.env.ENABLE_TEST_ONLY_RANDOMNESS = "1";
    setNodeEnv("production");

    assert.throws(() => createDeterministicRng(1), /disabled for production/);
  });

  it("roll rejects users that never joined", () => {
    const engine = withEngine();
    engine.fund("alice", 10_000n);
    engine.fund("bob", 10_000n);
    engine.fund("mallory", 10_000n);
    engine.create("g01", "alice", 1_000n);
    engine.join("g01", "bob");

    assert.throws(() => engine.roll("g01", "mallory"), /must be a participant/);
  });
});
