/** Never round an uncertain score up to 100%. Model scores are not verification. */
export function formatOcrConfidence(score: number): string {
  if (!Number.isFinite(score) || score < 0 || score > 1) return "Unavailable";
  return `${Math.floor(score * 1000) / 10}%`;
}
