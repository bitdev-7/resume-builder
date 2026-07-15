import "./load-env.js";
import express from "express";
import cors from "cors";
import { registerRoute } from "./next-adapter.js";

import { POST as analyzePost } from "./api/analyze/route.js";
import { GET as analyzeStatusGet } from "./api/analyze/status/route.js";
import { POST as extractJobPost } from "./api/extract-job/route.js";
import { POST as parseResumePost } from "./api/parse-resume/route.js";
import { POST as answerQuestionsPost } from "./api/answer-questions/route.js";
import { POST as checkAtsPost } from "./api/check-ats/route.js";
import { POST as coverLetterPost } from "./api/cover-letter/route.js";
import { POST as generatePdfPost } from "./api/generate-pdf/route.js";
import { POST as generateCoverLetterPdfPost } from "./api/generate-cover-letter-pdf/route.js";
import { GET as directAiModelsGet } from "./api/direct-ai-models/route.js";
import { GET as openrouterModelsGet } from "./api/openrouter-models/route.js";
import { POST as savePdfPost } from "./api/save-pdf/route.js";
import { POST as saveResumePdfPost } from "./api/save-resume-pdf/route.js";
import { POST as saveTextPost } from "./api/save-text/route.js";

const app = express();
const port = Number(process.env.PORT || 4000);

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(",").map((s) => s.trim()) : true,
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

registerRoute(app, "post", "/api/analyze", analyzePost);
registerRoute(app, "get", "/api/analyze/status/:jobId", analyzeStatusGet);
registerRoute(app, "post", "/api/extract-job", extractJobPost);
registerRoute(app, "post", "/api/parse-resume", parseResumePost);
registerRoute(app, "post", "/api/answer-questions", answerQuestionsPost);
registerRoute(app, "post", "/api/check-ats", checkAtsPost);
registerRoute(app, "post", "/api/cover-letter", coverLetterPost);
registerRoute(app, "post", "/api/generate-pdf", generatePdfPost);
registerRoute(app, "post", "/api/generate-cover-letter-pdf", generateCoverLetterPdfPost);
registerRoute(app, "get", "/api/direct-ai-models", directAiModelsGet);
registerRoute(app, "get", "/api/openrouter-models", openrouterModelsGet);
registerRoute(app, "post", "/api/save-pdf", savePdfPost);
registerRoute(app, "post", "/api/save-resume-pdf", saveResumePdfPost);
registerRoute(app, "post", "/api/save-text", saveTextPost);

const server = app.listen(port, () => {
  console.log(`Resume API backend listening on http://localhost:${port}`);
});

// Resume tailoring runs several sequential AI calls (JD analysis, per-experience
// generation, composer, optional repair) and can legitimately take minutes.
// Node's defaults would abort the request mid-generation and close the socket,
// which the frontend proxy reports as "socket hang up (ECONNRESET)":
//   - server.timeout (idle socket) was 300s here
//   - server.requestTimeout defaults to 300s since Node 18 (whole-request cap)
// Raise both well above the pipeline's worst case. Configurable via SERVER_TIMEOUT_MS.
const SERVER_TIMEOUT_MS = Number(process.env.SERVER_TIMEOUT_MS || 600_000);
server.setTimeout(SERVER_TIMEOUT_MS);
server.requestTimeout = SERVER_TIMEOUT_MS;
// headersTimeout must stay below requestTimeout; the default (60s) is fine.
