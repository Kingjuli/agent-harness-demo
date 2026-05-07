function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class ConfidencePostprocessor {
  constructor({ minConfidence = 0.45, minMargin = 0.05 } = {}) {
    this.minConfidence = minConfidence;
    this.minMargin = minMargin;
  }

  process(nodes) {
    const ranked = [...nodes]
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .map((node) => ({
        ...node,
        confidence: Number(clamp01(node.fusedScore).toFixed(4)),
      }));

    const best = ranked[0] ?? null;
    const second = ranked[1] ?? null;
    const margin = best && second ? best.confidence - second.confidence : best ? best.confidence : 0;

    const lowConfidence = !best || best.confidence < this.minConfidence;
    const ambiguous = !!best && !!second && margin < this.minMargin;

    return {
      best,
      alternatives: ranked.slice(1),
      count: ranked.length,
      diagnostics: {
        minAccepted: this.minConfidence,
        marginAccepted: this.minMargin,
        observedTop1: best?.confidence ?? 0,
        observedMargin: Number(margin.toFixed(4)),
        requiresClarification: lowConfidence || ambiguous,
      },
    };
  }
}
