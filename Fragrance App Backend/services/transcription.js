function normalizeTranscriptWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTranscript(value) {
  return normalizeTranscriptWhitespace(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeComparableToken(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .trim();
}

function collapseRepeatedWordRuns(tokens) {
  const collapsed = [];
  let index = 0;

  while (index < tokens.length) {
    const currentToken = tokens[index];
    const normalizedCurrentToken = normalizeComparableToken(currentToken);
    let runLength = 1;

    while (index + runLength < tokens.length) {
      const nextToken = tokens[index + runLength];

      if (normalizeComparableToken(nextToken) !== normalizedCurrentToken || !normalizedCurrentToken) {
        break;
      }

      runLength += 1;
    }

    if (runLength >= 3 && normalizedCurrentToken) {
      collapsed.push(currentToken);
    } else {
      collapsed.push(...tokens.slice(index, index + runLength));
    }

    index += runLength;
  }

  return collapsed;
}

function areEquivalentNgrams(leftTokens, rightTokens) {
  if (leftTokens.length !== rightTokens.length) {
    return false;
  }

  return leftTokens.every((token, index) => (
    normalizeComparableToken(token) === normalizeComparableToken(rightTokens[index])
  ));
}

function collapseRepeatedNgrams(tokens) {
  const workingTokens = [...tokens];
  let updated = true;

  while (updated) {
    updated = false;

    for (let ngramSize = 5; ngramSize >= 2; ngramSize -= 1) {
      for (let startIndex = 0; startIndex <= workingTokens.length - (ngramSize * 2); startIndex += 1) {
        const leftTokens = workingTokens.slice(startIndex, startIndex + ngramSize);
        const rightTokens = workingTokens.slice(startIndex + ngramSize, startIndex + (ngramSize * 2));
        const hasComparableTokens = leftTokens.every((token) => normalizeComparableToken(token));

        if (!hasComparableTokens || !areEquivalentNgrams(leftTokens, rightTokens)) {
          continue;
        }

        workingTokens.splice(startIndex + ngramSize, ngramSize);
        updated = true;
        break;
      }

      if (updated) {
        break;
      }
    }
  }

  return workingTokens;
}

function cleanTranscriptText(value) {
  const normalizedText = normalizeTranscriptWhitespace(value);

  if (!normalizedText) {
    return "";
  }

  const collapsedWordRuns = collapseRepeatedWordRuns(tokenizeTranscript(normalizedText));
  const collapsedPhrases = collapseRepeatedNgrams(collapsedWordRuns);

  return normalizeTranscriptWhitespace(collapsedPhrases.join(" "));
}

function getDominantTokenShare(tokens) {
  if (!tokens.length) {
    return 0;
  }

  const counts = new Map();
  let maxCount = 0;

  tokens.forEach((token) => {
    const normalizedToken = normalizeComparableToken(token);

    if (!normalizedToken) {
      return;
    }

    const nextCount = (counts.get(normalizedToken) || 0) + 1;
    counts.set(normalizedToken, nextCount);
    maxCount = Math.max(maxCount, nextCount);
  });

  return maxCount / tokens.length;
}

function evaluateTranscriptQuality({ rawText, cleanedText, durationMs = null }) {
  const rawTokens = tokenizeTranscript(rawText);
  const cleanedTokens = tokenizeTranscript(cleanedText);
  const removedRatio = rawTokens.length > 0
    ? Math.max(0, rawTokens.length - cleanedTokens.length) / rawTokens.length
    : 0;
  const dominantTokenShare = getDominantTokenShare(rawTokens);
  const safeDurationMs = Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : null;

  if (!cleanedTokens.length) {
    return { quality: "retry", retryReason: "unclear_audio" };
  }

  if (safeDurationMs !== null) {
    if (safeDurationMs >= 9000 && cleanedTokens.length < 5) {
      return { quality: "retry", retryReason: "partial_capture" };
    }

    if (safeDurationMs >= 6000 && cleanedTokens.length < 4) {
      return { quality: "retry", retryReason: "partial_capture" };
    }

    if (safeDurationMs >= 3500 && cleanedTokens.length < 2) {
      return { quality: "retry", retryReason: "partial_capture" };
    }
  }

  if (
    rawTokens.length >= 4
    && cleanedTokens.length <= 3
    && (removedRatio >= 0.45 || dominantTokenShare >= 0.6)
  ) {
    return { quality: "retry", retryReason: "repetition" };
  }

  if (safeDurationMs !== null && safeDurationMs >= 5000 && cleanedText.length < 12) {
    return { quality: "retry", retryReason: "unclear_audio" };
  }

  return { quality: "ok", retryReason: null };
}

function buildTranscriptionResult(rawText, { source = "openai_transcription", durationMs = null } = {}) {
  const cleanedText = cleanTranscriptText(rawText);
  const { quality, retryReason } = evaluateTranscriptQuality({
    rawText,
    cleanedText,
    durationMs
  });

  return {
    text: cleanedText,
    source,
    durationMs: Number.isFinite(Number(durationMs))
      ? Math.max(0, Math.round(Number(durationMs)))
      : null,
    quality,
    retryReason
  };
}

module.exports = {
  buildTranscriptionResult,
  cleanTranscriptText,
  evaluateTranscriptQuality,
  normalizeTranscriptWhitespace
};
