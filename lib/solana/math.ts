export function lamportsToSol(lamports: bigint): string {
  const divisor = 1_000_000_000n;
  const whole = lamports / divisor;
  const remainder = lamports % divisor;
  const fractional = remainder.toString().padStart(9, '0').replace(/0+$/, '');
  return fractional.length > 0 ? `${whole.toString()}.${fractional}` : whole.toString();
}

export function calculatePassLinePotentialPayout(buyInLamports: bigint, point: number): bigint {
  const edge = 14n;
  const hundred = 100n;
  const oddsMultiplier = point === 4 || point === 10 ? 2n : point === 5 || point === 9 ? 3n : 6n;
  const oddsDivisor = point === 4 || point === 10 ? 1n : point === 5 || point === 9 ? 2n : 5n;
  const base = buyInLamports;
  const odds = (buyInLamports * oddsMultiplier) / oddsDivisor;
  const gross = base + odds;
  return (gross * (hundred - edge)) / hundred;
}
