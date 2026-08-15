// ─────────────────────────────────────────────
// CONFIG — point this at your deployed Render backend
// ─────────────────────────────────────────────
const API_BASE = "https://codex-interview-backend.onrender.com";

// ─────────────────────────────────────────────
// VOICE ACTIVITY DETECTION — tune these, not the logic below.
// ─────────────────────────────────────────────
const VAD = {
  SPEECH_START_THRESHOLD: 0.02,   // RMS (0-1) above which we consider speech started
  SILENCE_DURATION: 1200,         // ms of continuous quiet before we consider the utterance over
  MIN_SPEECH_DURATION: 400,       // ms — ignore blips shorter than this
  MAX_RECORDING_DURATION: 60000,  // ms — hard safety cap per utterance
};

// ─────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────
const INTERVIEWER_SYSTEM_PROMPT = `You are a realistic, professional AI technical interviewer for Codex Interview AI, an educational practice tool. This is strictly practice — never suggest ways to cheat in a real interview, and never imply you are anything other than a practice tool.

Ask ONE question at a time, then wait for the candidate's answer. Your next message should follow up on what they just said before moving to a new subtopic — if they mention a technology, drill one level deeper into it. Increase difficulty as the candidate does well; simplify and stay encouraging if they struggle. Keep questions realistic and concise, testing understanding rather than trivia.

CANDIDATE: Adesanya Ibrahim Akolade — early-career Frontend Developer / UI-UX Designer / AI product builder, based in Lagos, Nigeria. Do not invent employment, certifications, or experience beyond what's listed below.

Technical background: HTML5, CSS3, JavaScript (ES6+), React, TypeScript, React Router, Tailwind CSS, responsive/mobile-first design. UI/UX: Figma, wireframing, prototyping, design systems, accessibility-aware design. Backend/data: Supabase, PostgreSQL, Firebase, authentication, Row-Level Security, database design, REST APIs (still developing, not a specialty). Tools: Git, GitHub, Vercel, Netlify, CI/CD, PWA.

Real projects he can speak to:
- MART101: rebuilt a no-code peer-to-peer campus marketplace prototype into a self-hosted, production-deployed full-stack app — React/TypeScript, Supabase, PostgreSQL with Row-Level Security, email + Google OAuth auth, image storage, admin dashboard, GitHub-to-Vercel CI/CD, installable PWA. His strongest project for backend/full-stack questions.
- Codex Hub: solo-founded AI-powered educational platform — CBT practice, an AI Study Lab (PDF-to-Quiz, flashcards, notes, summaries, AI chat), student dashboard, authentication, progress tracking, AI API integrations.
- Codex PREP: solo-founded Post-UTME exam-prep platform for a Nigerian university's applicants — CBT experience, performance tracking, admission prediction tools, study resources.
- Neighbourhood Futures: a Figma-only NGO UI/UX design assessment, not employment — responsive one-page layout, visual hierarchy, accessibility considerations.

He's honest that he uses AI as a development assistant for exploring solutions and debugging, while still owning the understanding, integration, and testing of the code himself.`;

const FULL_INTERVIEW_SUFFIX = `
Run a full interview: start with a short introduction question, then move through HTML/CSS, JavaScript, React, APIs/backend, Git, and one system-thinking scenario, finishing with a short coding question. Move to the next stage once a stage feels sufficiently covered — you don't need an exhaustive checklist. Begin now with your first question; do not wait for the candidate to speak first.

When you've covered enough ground for a fair evaluation (typically after 6-10 exchanges), wrap up warmly and end your final message with the exact token [[INTERVIEW_COMPLETE]] on its own line. Never use that token before you're actually ready to conclude.`;

function topicSuffix(topic) {
  return `
Focus this entire session only on: ${topic}. Ask progressively harder questions within this topic, drilling into anything the candidate mentions. Begin now with your first question; do not wait for the candidate to speak first.

When you've covered enough ground for a fair evaluation (typically after 5-8 exchanges), wrap up warmly and end your final message with the exact token [[INTERVIEW_COMPLETE]] on its own line. Never use that token before you're actually ready to conclude.`;
}

const CANDIDATE_SYSTEM_PROMPT = `You are Adesanya Ibrahim Akolade, answering interview questions as yourself in a mock practice session. You are the CANDIDATE — the user is the interviewer, asking you questions. Answer in first person, as Adesanya.

You're an early-career Frontend Developer / UI-UX Designer / early full-stack developer based in Lagos, Nigeria. Sound like a real junior developer talking naturally: conversational, concise (2-6 spoken sentences for most answers; a bit more for coding questions), confident but not arrogant, easy to say aloud. Never use corporate buzzwords like "leveraged", "results-driven", "cutting-edge", "synergized", "enterprise-grade", "passionate about delivering scalable solutions". Never sound like an AI assistant.

Do not invent employment, clients, companies, certifications, or metrics. Do not claim technologies you haven't actually used. If you genuinely don't know something, say so honestly — e.g. "I haven't worked with that directly, so I don't want to pretend I have. My understanding is..." — then give your best partial answer. Don't bluff.

Technical background: HTML5, CSS3, JavaScript (ES6+), React, TypeScript, React Router, Tailwind CSS, responsive/mobile-first design. UI/UX: Figma, wireframing, prototyping, design systems, accessibility-aware design. Backend/data: Supabase, PostgreSQL, Firebase, authentication, Row-Level Security, database design, REST APIs (still developing, not a specialty). Tools: Git, GitHub, Vercel, Netlify, CI/CD, PWA. Other: Adobe Photoshop, CorelDRAW, Canva, CapCut.

Real projects you can speak to (only discuss these when relevant to what's asked):
- MART101: you rebuilt a no-code peer-to-peer campus marketplace prototype into a self-hosted, production-deployed full-stack app — React/TypeScript, Supabase, PostgreSQL with Row-Level Security, email + Google OAuth auth, image storage, admin dashboard with analytics/moderation/audit logging, GitHub-to-Vercel CI/CD, installable PWA. Describe yourself as "primarily frontend-focused, with practical backend and database experience" — never "backend engineer" or "senior full-stack engineer".
- Codex Hub: you solo-built an AI-powered educational platform — CBT practice, an AI Study Lab (PDF-to-Quiz, flashcards, notes, summaries, AI chat), student dashboard, authentication, progress tracking, AI API integrations.
- Codex PREP: you solo-built a Post-UTME exam-prep platform for a Nigerian university's applicants — CBT experience, performance tracking, admission prediction tools, study resources.
- Neighbourhood Futures: a Figma-only NGO UI/UX design assessment (not employment) — responsive one-page layout, visual hierarchy, accessibility considerations, working from a design brief.

If asked whether you use AI to build your projects, answer honestly: "Yes, I use AI as a development assistant. I use it to explore solutions, debug issues, understand unfamiliar concepts and speed up parts of development. But I still have to understand what the code is doing, integrate it into the project, test it and troubleshoot it when something goes wrong." Don't hide it, and don't claim every line was manually written.

CRITICAL: Just answer the question as the candidate, then stop. Do not evaluate, grade, or comment on your own answer. Never say things like "that was a good question", "thank you", "I would rate my answer...", or "that answer demonstrates...". No self-commentary, no meta-discussion — just the answer.`;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let currentMode = "interviewer"; // "interviewer" | "candidate" | "live"
let selectedVoice = "text";      // "auto" | "manual" | "text"
let systemPrompt = "";
let history = []; // {role: "user"|"assistant", content}
let mentionedTech = new Set();
let currentQuestion = "";
let lastQuestion = null;
let lastAnswer = null;

const TECH_KEYWORDS = [
  "React", "TypeScript", "JavaScript", "Supabase", "Firebase", "PostgreSQL",
  "Tailwind", "Figma", "Git", "GitHub", "Vercel", "Netlify", "API", "REST",
  "Node", "Express", "CSS", "HTML", "OAuth", "PWA"
];

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const body = document.body;
const viewModeSelect = document.getElementById("view-mode-select");
const viewSetup = document.getElementById("view-setup");
const viewInterview = document.getElementById("view-interview");
const viewReport = document.getElementById("view-report");

const transcriptEl = document.getElementById("transcript");
const statusEl = document.getElementById("status-line");
const techTrackerEl = document.getElementById("tech-tracker");
const modeLabelEl = document.getElementById("mode-label");
const responseForm = document.getElementById("response-form");
const responseInput = document.getElementById("response-input");
const sendBtn = document.getElementById("send-btn");
const reviewBtn = document.getElementById("review-btn");
const getReportBtn = document.getElementById("get-report-btn");

const setupTitle = document.getElementById("setup-title");
const topicPanel = document.getElementById("topic-panel");
const beginPanel = document.getElementById("begin-panel");
const beginDesc = document.getElementById("begin-desc");
const beginSessionBtn = document.getElementById("begin-session");

const voiceBar = document.getElementById("voice-bar");
const voiceStateEl = document.getElementById("voice-state");
const voiceVizEl = document.getElementById("voice-viz");
const micBtn = document.getElementById("mic-btn");

const reportContent = document.getElementById("report-content");

// ─────────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────────
function showView(name) {
  [viewModeSelect, viewSetup, viewInterview, viewReport].forEach((v) => v.classList.add("hidden"));
  const map = {
    "mode-select": viewModeSelect,
    setup: viewSetup,
    interview: viewInterview,
    report: viewReport,
  };
  map[name].classList.remove("hidden");
  body.dataset.view = name;
}

// ─────────────────────────────────────────────
// MODE SELECT → SETUP
// ─────────────────────────────────────────────
document.querySelectorAll(".mode-card").forEach((card) => {
  card.addEventListener("click", () => enterSetup(card.dataset.mode));
});

function enterSetup(mode) {
  currentMode = mode;
  selectedVoice = "text";
  document.querySelectorAll(".voice-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.voice === "text");
  });

  if (mode === "interviewer") {
    setupTitle.textContent = "Set up your AI Interviewer session";
    topicPanel.classList.remove("hidden");
    beginPanel.classList.add("hidden");
  } else if (mode === "candidate") {
    setupTitle.textContent = "Set up your AI Candidate session";
    topicPanel.classList.add("hidden");
    beginPanel.classList.remove("hidden");
    beginDesc.textContent = "You'll play interviewer — ask Adesanya anything, and he'll answer based on his real background and projects.";
  } else if (mode === "live") {
    setupTitle.textContent = "Set up your Live Interview";
    topicPanel.classList.add("hidden");
    beginPanel.classList.remove("hidden");
    beginDesc.textContent = "A full simulated interview from introduction to a final evaluation report.";
  }

  showView("setup");
}

document.getElementById("setup-back").addEventListener("click", () => showView("mode-select"));

document.querySelectorAll(".voice-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedVoice = btn.dataset.voice;
    document.querySelectorAll(".voice-option").forEach((b) => b.classList.toggle("selected", b === btn));
  });
});

document.getElementById("start-full-interview").addEventListener("click", () => {
  beginInterviewerSession(INTERVIEWER_SYSTEM_PROMPT + FULL_INTERVIEW_SUFFIX, "Full Interview");
});

document.querySelectorAll(".topic-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    beginInterviewerSession(INTERVIEWER_SYSTEM_PROMPT + topicSuffix(btn.dataset.topic), btn.dataset.topic);
  });
});

beginSessionBtn.addEventListener("click", () => {
  if (currentMode === "candidate") {
    beginCandidateSession();
  } else if (currentMode === "live") {
    beginInterviewerSession(INTERVIEWER_SYSTEM_PROMPT + FULL_INTERVIEW_SUFFIX, "Live Interview");
  }
});

document.getElementById("exit-interview").addEventListener("click", exitInterview);
document.getElementById("report-back").addEventListener("click", () => {
  stopVoice();
  showView("mode-select");
});
responseForm.addEventListener("submit", handleSubmit);
reviewBtn.addEventListener("click", handleReview);
getReportBtn.addEventListener("click", () => generateFinalReport(true));

// ─────────────────────────────────────────────
// SESSION SETUP HELPERS
// ─────────────────────────────────────────────
function resetSessionState() {
  history = [];
  mentionedTech.clear();
  transcriptEl.innerHTML = "";
  techTrackerEl.innerHTML = "";
  currentQuestion = "";
  lastQuestion = null;
  lastAnswer = null;
  reviewBtn.disabled = true;
}

function configureInterviewChrome() {
  const showEval = currentMode === "interviewer" || currentMode === "live";
  reviewBtn.classList.toggle("hidden", currentMode === "candidate");
  getReportBtn.classList.toggle("hidden", !showEval);
  modeLabelEl.textContent =
    currentMode === "candidate" ? "AI Candidate — you're interviewing Adesanya" :
    currentMode === "live" ? "Live Interview" : "AI Interviewer";

  const useVoice = selectedVoice !== "text";
  voiceBar.classList.toggle("hidden", !useVoice);
  micBtn.classList.toggle("hidden", selectedVoice !== "manual");
}

// ─────────────────────────────────────────────
// AI INTERVIEWER / LIVE FLOW (AI asks, human answers)
// ─────────────────────────────────────────────
async function beginInterviewerSession(fullSystemPrompt, label) {
  systemPrompt = fullSystemPrompt;
  resetSessionState();
  showView("interview");
  configureInterviewChrome();
  await startVoiceIfNeeded();
  setStatus("thinking");

  const kickoff = [{ role: "user", content: "(interview session started)" }];

  try {
    const result = await callChat(systemPrompt, kickoff);
    const { content, complete } = extractCompletion(result.content);
    addMessage("interviewer", content);
    history.push({ role: "assistant", content: result.content });
    currentQuestion = content;
    setStatus("ready");
    if (complete) await generateFinalReport(false);
    else await resumeListeningIfAuto();
  } catch (err) {
    setStatus("error", "Couldn't reach the interviewer. Check your connection and try again.");
  }
}

// ─────────────────────────────────────────────
// AI CANDIDATE FLOW (human asks, AI answers as Adesanya)
// ─────────────────────────────────────────────
async function beginCandidateSession() {
  systemPrompt = CANDIDATE_SYSTEM_PROMPT;
  resetSessionState();
  showView("interview");
  configureInterviewChrome();
  await startVoiceIfNeeded();
  setStatus("ready", "Your turn — ask Adesanya a question");
  await resumeListeningIfAuto();
}

// ─────────────────────────────────────────────
// SHARED SUBMIT HANDLING
// ─────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  const text = responseInput.value.trim();
  if (!text) return;
  await submitTurn(text);
}

async function submitTurn(text) {
  const humanRole = currentMode === "candidate" ? "you" : "candidate";
  addMessage(humanRole, text);
  history.push({ role: "user", content: text });
  detectTech(text);

  if (currentMode !== "candidate") {
    lastQuestion = currentQuestion;
    lastAnswer = text;
    reviewBtn.disabled = false;
  }

  responseInput.value = "";
  sendBtn.disabled = true;
  setStatus("thinking");
  await pauseListeningWhileBusy();

  try {
    const result = await callChat(systemPrompt, history);
    const { content, complete } = extractCompletion(result.content);
    const aiRole = currentMode === "candidate" ? "candidate" : "interviewer";
    addMessage(aiRole, content);
    history.push({ role: "assistant", content: result.content });
    currentQuestion = content;
    setStatus("ready");
    if (complete) {
      await generateFinalReport(false);
    } else {
      await resumeListeningIfAuto();
    }
  } catch (err) {
    setStatus("error", "AI is temporarily unavailable. Please try sending that again.");
  } finally {
    sendBtn.disabled = false;
  }
}

function extractCompletion(raw) {
  const marker = "[[INTERVIEW_COMPLETE]]";
  if (raw.includes(marker)) {
    return { content: raw.replace(marker, "").trim(), complete: true };
  }
  return { content: raw, complete: false };
}

function exitInterview() {
  stopVoice();
  showView("mode-select");
  resetSessionState();
}

// ─────────────────────────────────────────────
// SINGLE-ANSWER REVIEW
// ─────────────────────────────────────────────
async function handleReview() {
  if (!lastAnswer) return;
  reviewBtn.disabled = true;
  reviewBtn.textContent = "Reviewing…";

  try {
    const res = await fetch(`${API_BASE}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "answer", question: lastQuestion, answer: lastAnswer }),
    });
    const data = await res.json();

    if (data.error) {
      addFeedbackError(data.error);
    } else {
      addFeedbackCard(data);
    }
  } catch (err) {
    addFeedbackError("Couldn't reach the reviewer. Check your connection and try again.");
  } finally {
    reviewBtn.disabled = false;
    reviewBtn.textContent = "Review last answer";
  }
}

// ─────────────────────────────────────────────
// FINAL EVALUATION REPORT
// ─────────────────────────────────────────────
async function generateFinalReport(manuallyTriggered) {
  if (currentMode === "candidate") return; // AI candidate never grades itself
  if (history.length === 0) {
    if (manuallyTriggered) addFeedbackError("Answer at least one question before requesting a report.");
    return;
  }

  stopVoice();
  setStatus("thinking", "Generating your final report…");

  try {
    const res = await fetch(`${API_BASE}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "final", transcript: history }),
    });
    const data = await res.json();

    if (data.error) {
      setStatus("error", data.error);
      return;
    }

    renderReport(data);
    showView("report");
  } catch (err) {
    setStatus("error", "Couldn't generate the report. Check your connection and try again.");
  }
}

function renderReport(data) {
  reportContent.innerHTML = "";

  const scoreHeader = document.createElement("div");
  scoreHeader.className = "report-score-header";
  scoreHeader.innerHTML = `<span class="report-overall">${data.overall_score ?? "—"}</span><span class="report-overall-label">Overall Score</span>`;
  reportContent.appendChild(scoreHeader);

  if (data.categories) {
    const grid = document.createElement("div");
    grid.className = "report-category-grid";
    for (const [key, value] of Object.entries(data.categories)) {
      const item = document.createElement("div");
      item.className = "report-category";
      item.innerHTML = `<span class="report-category-value">${value}/10</span><span class="report-category-label">${formatLabel(key)}</span>`;
      grid.appendChild(item);
    }
    reportContent.appendChild(grid);
  }

  const listSections = [
    ["Strong Areas", data.strong_areas],
    ["Weak Areas", data.weak_areas],
    ["Questions Missed", data.questions_missed],
    ["Technical Corrections", data.technical_corrections],
    ["Recommended Topics", data.recommended_topics],
  ];

  for (const [label, items] of listSections) {
    if (!items || !items.length) continue;
    const block = document.createElement("div");
    block.className = "report-block";
    block.innerHTML = `<span class="report-block-label">${label}</span>`;
    const ul = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    block.appendChild(ul);
    reportContent.appendChild(block);
  }

  if (data.suggested_practice_plan) {
    const block = document.createElement("div");
    block.className = "report-block";
    block.innerHTML = `<span class="report-block-label">Suggested Practice Plan</span><p>${data.suggested_practice_plan}</p>`;
    reportContent.appendChild(block);
  }
}

function formatLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─────────────────────────────────────────────
// API
// ─────────────────────────────────────────────
async function callChat(system, messages) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages }),
  });
  if (!res.ok) throw new Error(`chat request failed (${res.status})`);
  return res.json();
}

async function transcribeBlob(blob) {
  const form = new FormData();
  form.append("audio", blob, "answer.webm");
  const res = await fetch(`${API_BASE}/transcribe`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Transcription failed");
  return data;
}

// ─────────────────────────────────────────────
// UI HELPERS — transcript / status / tech tracker
// ─────────────────────────────────────────────
const ROLE_LABELS = { interviewer: "Interviewer", candidate: "Adesanya", you: "You" };

function addMessage(role, content) {
  const div = document.createElement("div");
  const bubbleRole = role === "you" ? "candidate" : role; // reuse candidate bubble styling for "you"
  div.className = `msg msg-${bubbleRole}`;
  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = ROLE_LABELS[role] || "You";
  div.appendChild(label);
  div.appendChild(document.createTextNode(content));
  transcriptEl.appendChild(div);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function setStatus(state, message) {
  statusEl.classList.toggle("thinking", state === "thinking");
  if (message) {
    statusEl.textContent = message;
  } else if (state === "thinking") {
    statusEl.textContent = currentMode === "candidate" ? "Adesanya is thinking…" : "Interviewer is preparing the next question…";
  } else if (state === "ready") {
    statusEl.textContent = "Ready";
  } else if (state === "error") {
    statusEl.textContent = "Something went wrong";
  }
  setVoiceState(state === "thinking" ? "thinking" : state === "error" ? "idle" : "ready");
}

function detectTech(text) {
  const lower = text.toLowerCase();
  let changed = false;
  for (const tech of TECH_KEYWORDS) {
    if (!mentionedTech.has(tech) && lower.includes(tech.toLowerCase())) {
      mentionedTech.add(tech);
      changed = true;
    }
  }
  if (changed) renderTechTracker();
}

const SCORE_LABELS = {
  technical_accuracy: "Technical Accuracy",
  clarity: "Clarity",
  structure: "Structure",
  confidence: "Confidence",
  relevance: "Relevance",
  completeness: "Completeness",
  communication: "Communication",
};

function addFeedbackCard(data) {
  const card = document.createElement("div");
  card.className = "feedback-card";

  const title = document.createElement("span");
  title.className = "msg-label";
  title.textContent = "Answer Review";
  card.appendChild(title);

  if (data.scores) {
    const grid = document.createElement("div");
    grid.className = "score-grid";
    for (const [key, label] of Object.entries(SCORE_LABELS)) {
      if (!(key in data.scores)) continue;
      const item = document.createElement("div");
      item.className = "score-item";
      item.innerHTML = `<span class="score-value">${data.scores[key]}/10</span><span class="score-label">${label}</span>`;
      grid.appendChild(item);
    }
    card.appendChild(grid);
  }

  const sections = [
    ["What was good", data.good],
    ["What was missing", data.missing],
    ["Technical mistakes", data.mistakes],
    ["How to improve", data.improve],
    ["A stronger example answer", data.stronger_example],
  ];

  for (const [label, text] of sections) {
    if (!text) continue;
    const block = document.createElement("div");
    block.className = "feedback-block";
    block.innerHTML = `<span class="feedback-block-label">${label}</span>`;
    const p = document.createElement("p");
    p.textContent = text;
    block.appendChild(p);
    card.appendChild(block);
  }

  transcriptEl.appendChild(card);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function addFeedbackError(message) {
  const card = document.createElement("div");
  card.className = "feedback-card feedback-error";
  card.textContent = message;
  transcriptEl.appendChild(card);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function renderTechTracker() {
  techTrackerEl.innerHTML = "";
  for (const tech of mentionedTech) {
    const tag = document.createElement("span");
    tag.className = "tech-tag";
    tag.textContent = tech;
    techTrackerEl.appendChild(tag);
  }
}

// ─────────────────────────────────────────────
// VOICE SYSTEM — manual mic + auto VAD listening
// ─────────────────────────────────────────────
let micStream = null;
let audioCtx = null;
let analyserNode = null;
let mediaRecorder = null;
let recordedChunks = [];
let vadRafId = null;
let vadSpeaking = false;
let vadSpeechStart = 0;
let vadSilenceStart = 0;
let vadMaxTimer = null;
let voiceBusy = false; // true while processing/thinking — auto mode pauses listening

async function startVoiceIfNeeded() {
  if (selectedVoice === "text") return;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setVoiceState("idle");
    addFeedbackError("Microphone access is required for voice practice. You can continue with text mode.");
    selectedVoice = "text";
    voiceBar.classList.add("hidden");
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(micStream);
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 512;
  source.connect(analyserNode);

  micBtn.addEventListener("click", handleMicTap);

  if (selectedVoice === "auto") {
    setVoiceState("listening");
  } else {
    setVoiceState("idle");
  }
}

function stopVoice() {
  if (vadRafId) cancelAnimationFrame(vadRafId);
  vadRafId = null;
  if (vadMaxTimer) clearTimeout(vadMaxTimer);
  vadMaxTimer = null;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try { mediaRecorder.stop(); } catch (_) {}
  }
  mediaRecorder = null;
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  analyserNode = null;
  micBtn.removeEventListener("click", handleMicTap);
  micBtn.classList.remove("active");
}

async function pauseListeningWhileBusy() {
  voiceBusy = true;
  if (vadRafId) cancelAnimationFrame(vadRafId);
  vadRafId = null;
}

async function resumeListeningIfAuto() {
  voiceBusy = false;
  if (selectedVoice === "auto" && analyserNode) {
    setVoiceState("listening");
    startVadLoop();
  }
}

function setVoiceState(state) {
  if (!voiceStateEl) return;
  const labels = {
    idle: "Idle",
    listening: "Listening…",
    recording: "Recording…",
    processing: "Processing audio…",
    transcribing: "Transcribing…",
    thinking: currentMode === "candidate" ? "Adesanya is thinking…" : "Interviewer is preparing the next question…",
    ready: "Ready",
  };
  voiceStateEl.textContent = labels[state] || "Idle";
  voiceVizEl.classList.toggle("active", state === "listening" || state === "recording");
  micBtn.classList.toggle("active", state === "recording");
}

// ── Manual mode ────────────────────────────────
function handleMicTap() {
  if (selectedVoice !== "manual") return;
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  } else {
    startRecording(async (blob) => {
      await submitAudio(blob);
    });
  }
}

// ── Auto mode (VAD) ────────────────────────────
function startVadLoop() {
  const data = new Uint8Array(analyserNode.fftSize);

  function tick() {
    if (!analyserNode || voiceBusy || selectedVoice !== "auto") return;
    analyserNode.getByteTimeDomainData(data);

    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const now = performance.now();

    if (!vadSpeaking) {
      if (rms > VAD.SPEECH_START_THRESHOLD) {
        vadSpeaking = true;
        vadSpeechStart = now;
        vadSilenceStart = 0;
        setVoiceState("recording");
        startRecording(async (blob) => {
          vadSpeaking = false;
          await submitAudio(blob);
        });
        if (vadMaxTimer) clearTimeout(vadMaxTimer);
        vadMaxTimer = setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
        }, VAD.MAX_RECORDING_DURATION);
      }
    } else {
      if (rms > VAD.SPEECH_START_THRESHOLD) {
        vadSilenceStart = 0;
      } else {
        if (!vadSilenceStart) vadSilenceStart = now;
        const spokeLongEnough = now - vadSpeechStart > VAD.MIN_SPEECH_DURATION;
        const quietLongEnough = now - vadSilenceStart > VAD.SILENCE_DURATION;
        if (spokeLongEnough && quietLongEnough) {
          if (vadMaxTimer) clearTimeout(vadMaxTimer);
          if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
        }
      }
    }

    vadRafId = requestAnimationFrame(tick);
  }

  vadRafId = requestAnimationFrame(tick);
}

// ── Shared recording primitive ─────────────────
function startRecording(onStop) {
  recordedChunks = [];
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  mediaRecorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    recordedChunks = [];
    onStop(blob);
  };
  mediaRecorder.start();
}

async function submitAudio(blob) {
  setVoiceState("processing");
  setStatus("thinking", "Processing audio…");
  try {
    setVoiceState("transcribing");
    const { text } = await transcribeBlob(blob);
    if (!text || !text.trim()) {
      addFeedbackError("Couldn't understand that recording. Please try again.");
      setStatus("ready");
      await resumeListeningIfAuto();
      return;
    }
    await submitTurn(text.trim());
  } catch (err) {
    addFeedbackError("Couldn't understand that recording. Please try again.");
    setStatus("ready");
    await resumeListeningIfAuto();
  }
}
