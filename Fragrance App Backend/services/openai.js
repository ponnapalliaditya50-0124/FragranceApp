const {
  getScentDisambiguationResponseFormat,
  getUsageInterpretationResponseFormat,
  sanitizeScentCandidateResponse,
  sanitizeUsageInterpretation
} = require("../taxonomy");
const { buildTranscriptionResult } = require("./transcription");

const OPENAI_API_BASE = "https://api.openai.com/v1";
const DEFAULT_INTERPRET_MODEL = "gpt-5-mini";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-transcribe";

class OpenAiServiceError extends Error {
  constructor(message, { status = 500, code = "LLM_REQUEST_FAILED", details = null } = {}) {
    super(message);
    this.name = "OpenAiServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getOpenAiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    interpretModel: process.env.OPENAI_INTERPRET_MODEL || DEFAULT_INTERPRET_MODEL,
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL
  };
}

function ensureConfigured() {
  const config = getOpenAiConfig();

  if (!config.apiKey) {
    throw new OpenAiServiceError("OpenAI is not configured for this backend.", {
      status: 503,
      code: "LLM_UNAVAILABLE"
    });
  }

  return config;
}

function extractResponseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  const fragments = [];

  payload.output.forEach((item) => {
    if (!item || !Array.isArray(item.content)) {
      return;
    }

    item.content.forEach((contentItem) => {
      if (contentItem && typeof contentItem.text === "string" && contentItem.text.trim()) {
        fragments.push(contentItem.text.trim());
      }
    });
  });

  return fragments.join("\n").trim();
}

function extractRefusal(payload) {
  if (typeof payload.refusal === "string" && payload.refusal.trim()) {
    return payload.refusal.trim();
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  for (const item of payload.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (
        contentItem
        && contentItem.type === "refusal"
        && typeof contentItem.refusal === "string"
        && contentItem.refusal.trim()
      ) {
        return contentItem.refusal.trim();
      }
    }
  }

  return "";
}

async function requestOpenAiJson(endpoint, options = {}) {
  const { apiKey } = ensureConfigured();
  const response = await fetch(`${OPENAI_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {})
    }
  });

  const rawBody = await response.text();
  let payload = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      throw new OpenAiServiceError("OpenAI returned an invalid JSON response.", {
        status: 502,
        code: "LLM_REQUEST_FAILED"
      });
    }
  }

  if (!response.ok) {
    const upstreamMessage = payload && payload.error && payload.error.message
      ? payload.error.message
      : "OpenAI request failed.";
    const upstreamCode = response.status === 401 || response.status === 403
      ? "LLM_UNAVAILABLE"
      : "LLM_REQUEST_FAILED";

    throw new OpenAiServiceError(upstreamMessage, {
      status: response.status >= 500 ? 502 : response.status,
      code: upstreamCode,
      details: payload
    });
  }

  return payload || {};
}

async function requestStructuredResponse({ systemPrompt, userPrompt, format }) {
  const config = ensureConfigured();
  const response = await requestOpenAiJson("/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.interpretModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemPrompt
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userPrompt
            }
          ]
        }
      ],
      text: {
        format
      },
      max_output_tokens: 600
    })
  });

  const refusal = extractRefusal(response);

  if (refusal) {
    throw new OpenAiServiceError("The interpretation request was refused.", {
      status: 422,
      code: "LLM_REFUSED",
      details: refusal
    });
  }

  const responseText = extractResponseText(response);

  if (!responseText) {
    throw new OpenAiServiceError("OpenAI returned an empty response.", {
      status: 502,
      code: "LLM_REQUEST_FAILED"
    });
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new OpenAiServiceError("OpenAI returned an unreadable structured payload.", {
      status: 502,
      code: "LLM_REQUEST_FAILED"
    });
  }
}

function createScentDisambiguationPrompt(context) {
  const safeContext = context && typeof context === "object"
    ? context
    : { text: String(context || "") };

  return JSON.stringify({
    text: String(safeContext.text || ""),
    deterministicCandidates: safeContext.deterministicCandidates || {
      families: [],
      notes: [],
      accords: []
    },
    derivedProfile: safeContext.derivedProfile || {
      families: [],
      notes: [],
      accords: []
    }
  }, null, 2);
}

async function createScentDisambiguation(context) {
  const text = context && typeof context === "object"
    ? String(context.text || "").trim()
    : String(context || "").trim();

  if (!text) {
    return sanitizeScentCandidateResponse({});
  }

  const parsedPayload = await requestStructuredResponse({
    systemPrompt: [
      "You translate fragrance preference text into structured scent-profile candidates.",
      "You are a disambiguation layer, not the primary parser.",
      "Use the provided deterministic candidates as grounding, but you may add or remove suggestions when the language clearly supports it.",
      "Return only values allowed by the schema.",
      "Prefer empty arrays over guessing.",
      "Use confidence carefully and include short reasons that cite matched phrases or scent logic."
    ].join(" "),
    userPrompt: createScentDisambiguationPrompt(context),
    format: getScentDisambiguationResponseFormat()
  });

  return sanitizeScentCandidateResponse(parsedPayload);
}

async function createUsageInterpretation(text) {
  const trimmedText = String(text || "").trim();

  if (!trimmedText) {
    return sanitizeUsageInterpretation({ source: "rules" });
  }

  const parsedPayload = await requestStructuredResponse({
    systemPrompt: [
      "You translate fragrance usage-intent text into structured occasion and climate suggestions.",
      "Return only values allowed by the schema.",
      "When uncertain, prefer empty arrays instead of guessing.",
      "Write a concise plain-language summary."
    ].join(" "),
    userPrompt: trimmedText,
    format: getUsageInterpretationResponseFormat()
  });

  return sanitizeUsageInterpretation({
    ...parsedPayload,
    source: "llm"
  });
}

async function transcribeAudio(file, { language = "en", fallbackDurationMs = null } = {}) {
  const config = ensureConfigured();
  const formData = new FormData();

  formData.append("file", file, file && file.name ? file.name : "dictation.webm");
  formData.append("model", config.transcribeModel);
  formData.append("language", language);
  formData.append("response_format", "json");
  formData.append(
    "prompt",
    [
      "Transcribe the spoken words verbatim in English.",
      "Preserve short fragrance phrases like cedar forest, tobacco leaf, fresh out of the shower, warm smoky vanilla.",
      "Do not invent filler words or repeated words unless they were clearly spoken."
    ].join(" ")
  );

  const response = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    },
    body: formData
  });

  const rawBody = await response.text();
  let payload = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      payload = null;
    }
  }

  if (!response.ok) {
    const upstreamMessage = payload && payload.error && payload.error.message
      ? payload.error.message
      : "OpenAI transcription failed.";
    const upstreamCode = response.status === 401 || response.status === 403
      ? "LLM_UNAVAILABLE"
      : "LLM_REQUEST_FAILED";

    throw new OpenAiServiceError(upstreamMessage, {
      status: response.status >= 500 ? 502 : response.status,
      code: upstreamCode,
      details: payload
    });
  }

  const rawTranscriptText = payload && typeof payload.text === "string"
    ? payload.text
    : "";

  return buildTranscriptionResult(rawTranscriptText, {
    source: "openai_transcription",
    durationMs: fallbackDurationMs
  });
}

module.exports = {
  OpenAiServiceError,
  createScentDisambiguation,
  createUsageInterpretation,
  ensureConfigured,
  transcribeAudio
};
