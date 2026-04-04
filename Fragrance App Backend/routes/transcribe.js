const express = require("express");
const { OpenAiServiceError, transcribeAudio } = require("../services/openai");

const router = express.Router();
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/mp3",
  "audio/m4a",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/flac"
]);

function createRequestHeaders(req) {
  const headers = new Headers();

  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
      return;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  });

  return headers;
}

async function readMultipartForm(req) {
  const request = new Request("http://localhost/api/transcribe", {
    method: req.method,
    headers: createRequestHeaders(req),
    body: req,
    duplex: "half"
  });

  return request.formData();
}

router.post("/", async (req, res) => {
  try {
    const contentType = String(req.headers["content-type"] || "");
    const contentLength = Number.parseInt(req.headers["content-length"] || "0", 10);

    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      res.status(415).json({
        error: "Audio uploads must use multipart/form-data.",
        code: "UNSUPPORTED_MEDIA_TYPE"
      });
      return;
    }

    if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES) {
      res.status(413).json({
        error: "Audio upload is too large.",
        code: "AUDIO_TOO_LARGE"
      });
      return;
    }

    const form = await readMultipartForm(req);
    const audio = form.get("audio");
    const durationMsValue = form.get("durationMs");
    const durationMs = Number.parseInt(String(durationMsValue || "0"), 10);

    if (!(audio instanceof File)) {
      res.status(400).json({ error: "Audio file is required.", code: "AUDIO_REQUIRED" });
      return;
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      res.status(413).json({
        error: "Audio upload is too large.",
        code: "AUDIO_TOO_LARGE"
      });
      return;
    }

    const normalizedAudioType = String(audio.type || "").split(";", 1)[0].trim().toLowerCase();

    if (normalizedAudioType && !SUPPORTED_AUDIO_TYPES.has(normalizedAudioType)) {
      res.status(415).json({
        error: "Unsupported audio format.",
        code: "UNSUPPORTED_AUDIO_TYPE"
      });
      return;
    }

    const transcription = await transcribeAudio(audio, {
      language: "en",
      fallbackDurationMs: Number.isFinite(durationMs) ? durationMs : null
    });

    res.json(transcription);
  } catch (error) {
    if (error instanceof OpenAiServiceError) {
      console.info(`[transcribe] failed code=${error.code} status=${error.status}`);
      res.status(error.status).json({
        error: error.message,
        code: error.code
      });
      return;
    }

    console.error("Failed to transcribe audio:", error);
    res.status(500).json({ error: "Failed to transcribe audio", code: "TRANSCRIBE_FAILED" });
  }
});

module.exports = router;
