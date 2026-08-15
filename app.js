// ─────────────────────────────────────────────
// CONFIG — point this at your deployed Render backend
// ─────────────────────────────────────────────
const API_BASE = "https://codex-interview-backend.onrender.com";

// ─────────────────────────────────────────────
// VOICE ACTIVITY DETECTION — tune these, not the logic below.
// Three sensitivity presets; MEDIUM is the default. LOW is more forgiving
// of natural mid-answer pauses, HIGH cuts off sooner for snappier turns.
// ─────────────────────────────────────────────
const VAD_PRESETS = {
  low: {
    SPEECH_START_THRESHOLD: 0.025,
    SILENCE_DURATION: 1800,
    MIN_SPEECH_DURATION: 400,
    MAX_RECORDING_DURATION: 60000,
  },
  medium: {
    SPEECH_START_THRESHOLD: 0.02,
    SILENCE_DURATION: 1200,
    MIN_SPEECH_DURATION: 400,
    MAX_RECORDING_DURATION: 60000,
  },
  high: {
    SPEECH_START_THRESHOLD: 0.015,
    SILENCE_DURATION: 800,
    MIN_SPEECH_DURATION: 300,
    MAX_RECORDING_DURATION: 60000,
  },
};
let sensitivity = "medium"; // "low" | "medium" | "high"
function VAD() { return VAD_PRESETS[sensitivity]; }

// ─────────────────────────────────────────────
// DIFFICULTY — controls how hard the AI Interviewer pushes
// ─────────────────────────────────────────────
const DIFFICULTY_TEXT = {
  easy: `
Difficulty: EASY. Ask foundational, confidence-building questions. Stick to core concepts, avoid trick questions or deep edge cases, and if the candidate struggles, simplify further and stay encouraging rather than pushing harder.`,
  mid: `
Difficulty: MID. Ask standard junior/mid-level questions with normal follow-up depth — the default bar for this role level.`,
  pro: `
Difficulty: PRO. Push like a senior-level technical screen: expect precise terminology, ask "why" and "what would break" follow-ups, probe trade-offs, and don't let vague answers pass without a follow-up.`,
  high: `
Difficulty: HIGH. Interview at staff/principal intensity: rapid, pointed follow-ups, edge cases and failure modes by default, minimal hand-holding, and call out imprecise or hand-wavy answers directly before moving on.`,
};
let difficulty = "mid"; // "easy" | "mid" | "pro" | "high"

// Brief pause after a response is displayed before auto-listening resumes.
// Gives any lingering audio state a moment to settle and prevents the mic
// from immediately re-triggering on the tail of the previous turn.
const COOLDOWN_MS = 700;

// Reject transcripts that are empty, filler-only, or too short to be a
// real utterance — auto mode stays listening instead of submitting noise.
const FILLER_ONLY = /^(um+|uh+|erm+|hmm+|mm+|ah+|okay|ok|yeah|yes|no|so|like|the|a|and)[\s.,!?]*$/i;
const MIN_MEANINGFUL_CHARS = 4;

// ─────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────
const INTERVIEWER_SYSTEM_PROMPT = `You are a realistic, professional AI technical interviewer for Codex Interview AI, an educational practice tool. This is strictly practice — never suggest ways to cheat in a real interview, and never imply you are anything other than a practice tool.

Always respond in English, even if the candidate's answer comes through in another language (e.g. a transcription error or a typo in a different language) — never switch languages to match them.

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

Always respond in English, even if the interviewer's question comes through in another language (e.g. a transcription error or a typo in a different language) — never switch languages to match them.

You're an early-career Frontend Developer / UI-UX Designer / early full-stack developer based in Lagos, Nigeria. Sound like a real junior developer talking naturally, not like a written essay. Keep answers tight: usually 3-5 spoken sentences, up to 6-7 for coding/system-design questions where you genuinely need to walk through steps. Answer the actual question first, then support it with one concrete detail or example — but a complete, well-reasoned answer always beats a shorter incomplete one, so don't chop real explanation just to hit a sentence count. Don't restate the question and don't add a closing summary/recap. Cut generic feelings/reflection tags — "I'm proud of how it turned out", "it was a great learning experience", "which was challenging but rewarding", "it was a fun project" — end each point on the concrete fact instead; only mention how something felt if the question actually asks about that. If asked to cover multiple things (e.g. "a few of your projects"), give each one 1-2 sentences — name, what it is, one real detail — rather than a full paragraph per item; depth on any one of them comes from a follow-up question, not the first pass. Confident but not arrogant, easy to say aloud. Never use corporate buzzwords like "leveraged", "results-driven", "cutting-edge", "synergized", "enterprise-grade", "passionate about delivering scalable solutions". Never sound like an AI assistant — it's fine to trail off naturally or sound slightly informal rather than polished and complete every time.

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
let selectedDurationMinutes = 30; // used for interviewer/live modes only
let timerInterval = null;
let timerRemainingSeconds = 0;

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

const durationPanel = document.getElementById("duration-panel");
const durationCustom = document.getElementById("duration-custom");
const durationCustomInput = document.getElementById("duration-custom-input");
const timerDisplayEl = document.getElementById("timer-display");

const confirmOverlay = document.getElementById("confirm-overlay");
const confirmContinueBtn = document.getElementById("confirm-continue");
const confirmEndBtn = document.getElementById("confirm-end");

const voiceBar = document.getElementById("voice-bar");
const voiceStateEl = document.getElementById("voice-state");
const voiceVizEl = document.getElementById("voice-viz");
const micBtn = document.getElementById("mic-btn");

const reportContent = document.getElementById("report-content");
const jumpLatestBtn = document.getElementById("jump-latest");

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
  if (document.getElementById("sensitivity-row")) document.getElementById("sensitivity-row").classList.add("hidden");

  const showDuration = mode === "interviewer" || mode === "live";
  if (durationPanel) durationPanel.classList.toggle("hidden", !showDuration);
  if (showDuration) resetDurationPicker();

  const difficultyPanel = document.getElementById("difficulty-panel");
  if (difficultyPanel) difficultyPanel.classList.toggle("hidden", !showDuration);
  if (showDuration) resetDifficultyPicker();

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

// ── Interview length picker (Interviewer / Live only) ─────
function resetDurationPicker() {
  selectedDurationMinutes = 30;
  if (durationCustom) durationCustom.classList.add("hidden");
  if (durationCustomInput) durationCustomInput.value = "";
  document.querySelectorAll("#duration-grid .duration-chip").forEach((b) => b.classList.toggle("selected", b.dataset.minutes === "30"));
}

document.querySelectorAll("#duration-grid .duration-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#duration-grid .duration-chip").forEach((b) => b.classList.toggle("selected", b === btn));
    if (btn.dataset.minutes === "custom") {
      if (durationCustom) durationCustom.classList.remove("hidden");
      if (durationCustomInput) durationCustomInput.focus();
      applyCustomDuration();
    } else {
      if (durationCustom) durationCustom.classList.add("hidden");
      selectedDurationMinutes = Number(btn.dataset.minutes);
    }
  });
});

function resetDifficultyPicker() {
  difficulty = "mid";
  document.querySelectorAll("#difficulty-grid .duration-chip").forEach((b) => b.classList.toggle("selected", b.dataset.difficulty === "mid"));
}

document.querySelectorAll("#difficulty-grid .duration-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.difficulty;
    document.querySelectorAll("#difficulty-grid .duration-chip").forEach((b) => b.classList.toggle("selected", b === btn));
  });
});

function applyCustomDuration() {
  const val = Number(durationCustomInput.value);
  if (Number.isFinite(val) && val >= 5 && val <= 120) {
    selectedDurationMinutes = Math.round(val);
  }
}

if (durationCustomInput) durationCustomInput.addEventListener("input", applyCustomDuration);

const sensitivityRow = document.getElementById("sensitivity-row");

document.querySelectorAll(".voice-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedVoice = btn.dataset.voice;
    document.querySelectorAll(".voice-option").forEach((b) => b.classList.toggle("selected", b === btn));
    // Sensitivity only matters for auto-listen (it tunes silence detection);
    // manual mode has no silence timeout and text mode has no mic at all.
    if (sensitivityRow) sensitivityRow.classList.toggle("hidden", selectedVoice !== "auto");
  });
});

document.querySelectorAll(".sensitivity-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    sensitivity = btn.dataset.sensitivity;
    document.querySelectorAll(".sensitivity-btn").forEach((b) => b.classList.toggle("selected", b === btn));
  });
});

document.getElementById("start-full-interview").addEventListener("click", () => {
  beginInterviewerSession(INTERVIEWER_SYSTEM_PROMPT + DIFFICULTY_TEXT[difficulty] + FULL_INTERVIEW_SUFFIX, "Full Interview");
});

document.querySelectorAll(".topic-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    beginInterviewerSession(INTERVIEWER_SYSTEM_PROMPT + DIFFICULTY_TEXT[difficulty] + topicSuffix(btn.dataset.topic), btn.dataset.topic);
  });
});

beginSessionBtn.addEventListener("click", () => {
  if (currentMode === "candidate") {
    beginCandidateSession();
  } else if (currentMode === "live") {
    beginInterviewerSession(INTERVIEWER_SYSTEM_PROMPT + DIFFICULTY_TEXT[difficulty] + FULL_INTERVIEW_SUFFIX, "Live Interview");
  }
});

document.getElementById("exit-interview").addEventListener("click", () => showEndConfirm());
document.getElementById("report-back").addEventListener("click", () => {
  stopVoice();
  showView("mode-select");
});
responseForm.addEventListener("submit", handleSubmit);
reviewBtn.addEventListener("click", handleReview);
getReportBtn.addEventListener("click", () => showEndConfirm());
if (confirmContinueBtn && confirmOverlay) {
  confirmContinueBtn.addEventListener("click", () => confirmOverlay.classList.add("hidden"));
}
if (confirmEndBtn) {
  confirmEndBtn.addEventListener("click", () => {
    if (confirmOverlay) confirmOverlay.classList.add("hidden");
    endInterviewNow(true);
  });
}

// ─────────────────────────────────────────────
// END INTERVIEW — confirmation + finalize
// ─────────────────────────────────────────────
function showEndConfirm() {
  if (!confirmOverlay) {
    if (window.confirm("End this interview?")) endInterviewNow(true);
    return;
  }
  const confirmMessage = document.getElementById("confirm-message");
  if (confirmMessage) confirmMessage.textContent = "End this interview?";
  confirmOverlay.classList.remove("hidden");
}

async function endInterviewNow(manuallyTriggered) {
  stopTimer();
  if (currentMode === "candidate") {
    exitInterview();
  } else {
    await generateFinalReport(manuallyTriggered);
  }
}

// Auto-triggered when the countdown reaches zero — no confirmation needed,
// the interview is simply over.
async function autoEndInterview() {
  if (confirmOverlay) confirmOverlay.classList.add("hidden");
  stopTimer();
  await generateFinalReport(false);
}

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
  lastProcessedTranscript = "";
  reviewBtn.disabled = true;
  stopTimer();
  if (jumpLatestBtn) jumpLatestBtn.classList.add("hidden");
  if (confirmOverlay) confirmOverlay.classList.add("hidden");
}

// ─────────────────────────────────────────────
// INTERVIEW TIMER (Interviewer / Live modes only)
// ─────────────────────────────────────────────
function startTimer(minutes) {
  stopTimer();
  timerRemainingSeconds = Math.round(minutes * 60);
  if (timerDisplayEl) timerDisplayEl.classList.remove("hidden");
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerRemainingSeconds -= 1;
    updateTimerDisplay();
    if (timerRemainingSeconds <= 0) {
      autoEndInterview();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  if (timerDisplayEl) timerDisplayEl.classList.add("hidden");
  if (timerDisplayEl) timerDisplayEl.classList.remove("warn", "critical");
}

function updateTimerDisplay() {
  const clamped = Math.max(0, timerRemainingSeconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  if (!timerDisplayEl) return;
  timerDisplayEl.textContent = `${mins}:${String(secs).padStart(2, "0")} remaining`;
  timerDisplayEl.classList.toggle("warn", clamped <= 300 && clamped > 60);
  timerDisplayEl.classList.toggle("critical", clamped <= 60);
}

// ─────────────────────────────────────────────
// TEXT-TO-SPEECH — clean abstraction so a dedicated provider (e.g. ElevenLabs
// via the backend) can replace the browser engine later without touching
// any call site. Every call site only ever uses TTS.speak / .stop / .isSpeaking.
//
// Long answers are split into sentence-sized chunks and queued sequentially —
// several mobile browsers (notably Chrome on Android) silently cut off a
// single SpeechSynthesisUtterance after ~15 seconds, which would otherwise
// truncate a normal 4-6 sentence candidate answer mid-word.
// ─────────────────────────────────────────────
const TTS = (() => {
  let cancelled = false;

  function splitIntoChunks(text) {
    const sentences = text.match(/[^.!?]+[.!?]*(\s+|$)/g);
    return (sentences && sentences.length ? sentences : [text]).map((s) => s.trim()).filter(Boolean);
  }

  let preferredVoice = null;

  function chooseVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const preferredNames = [
      /Microsoft.*(Guy|Ryan|Christopher|Brian|Andrew)/i,
      /Google.*(US English|UK English)/i,
      /Samantha/i, /Daniel/i, /Alex/i
    ];
    for (const pattern of preferredNames) {
      const match = voices.find(v => pattern.test(v.name) && /^en[-_]/i.test(v.lang));
      if (match) return match;
    }
    return voices.find(v => /^en[-_]/i.test(v.lang)) || voices[0];
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window) || !text || !text.trim()) { resolve(); return; }
      window.speechSynthesis.cancel();
      cancelled = false;
      preferredVoice = preferredVoice || chooseVoice();
      const chunks = splitIntoChunks(text);
      let i = 0;

      function speakNext() {
        if (cancelled || i >= chunks.length) { resolve(); return; }
        const utter = new SpeechSynthesisUtterance(chunks[i]);
        if (preferredVoice) utter.voice = preferredVoice;
        // Faster and more conversational than the old 1.02 rate.
        utter.rate = 1.20;
        utter.pitch = 0.97;
        utter.volume = 1;
        utter.onend = () => { i++; speakNext(); };
        utter.onerror = () => { i++; speakNext(); };
        window.speechSynthesis.speak(utter);
      }
      speakNext();
    });
  }

  function stop() {
    cancelled = true;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function isSpeaking() {
    return "speechSynthesis" in window && window.speechSynthesis.speaking;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener?.("voiceschanged", () => {
      preferredVoice = chooseVoice();
    });
  }

  return { speak, stop, isSpeaking };
})();

// Speaks the AI's turn aloud when voice mode is active, locking the mic via
// the "speaking" FSM state for the duration so the mic can never hear the
// AI's own voice and mistake it for the candidate's next utterance.
async function speakIfVoice(text) {
  // AI Candidate is intentionally text-only on the AI side. The user
  // interviews Adesanya; the candidate response should never be spoken by
  // the browser, even when the interviewer uses microphone input.
  if (selectedVoice === "text" || currentMode === "candidate") return;
  setFSM("speaking");
  await TTS.speak(text);
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
  // In AI Candidate voice mode the microphone is the primary composer and
  // sits at the bottom centre. Text mode is the only mode that exposes Send.
  const showCandidateMic = currentMode === "candidate" && selectedVoice !== "text";
  micBtn.classList.toggle("hidden", currentMode === "candidate" ? !showCandidateMic : selectedVoice !== "manual");
  responseForm.classList.toggle("hidden", currentMode === "candidate" && selectedVoice !== "text");
  viewInterview.classList.toggle("candidate-mode", currentMode === "candidate");
}

// ─────────────────────────────────────────────
// AI INTERVIEWER / LIVE FLOW (AI asks, human answers)
// ─────────────────────────────────────────────
async function beginInterviewerSession(fullSystemPrompt, label) {
  systemPrompt = fullSystemPrompt;
  resetSessionState();
  showView("interview");
  configureInterviewChrome();
  startTimer(selectedDurationMinutes);
  await startVoiceIfNeeded();
  setStatus("thinking");

  const kickoff = [{ role: "user", content: "(interview session started)" }];

  try {
    const streamBubble = addStreamingMessage("interviewer");
    const result = await callChatStream(systemPrompt, kickoff, (partial) => {
      streamBubble.update(partial.replace("[[INTERVIEW_COMPLETE]]", "").trimEnd());
    });
    const { content, complete } = extractCompletion(result.content);
    streamBubble.update(content);
    history.push({ role: "assistant", content: result.content });
    currentQuestion = content;
    setStatus("ready");
    await speakIfVoice(content);
    if (complete) await generateFinalReport(false);
    else await enterCooldownThenResume();
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
  // Voice-based AI Candidate sessions have no text Send action.
  if (currentMode === "candidate" && selectedVoice !== "text") return;
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
    const aiRole = currentMode === "candidate" ? "candidate" : "interviewer";
    const streamBubble = addStreamingMessage(aiRole);
    const result = await callChatStream(systemPrompt, history, (partial) => {
      // Strip the completion marker from the live view so it never flashes
      // on screen while streaming in.
      streamBubble.update(partial.replace("[[INTERVIEW_COMPLETE]]", "").trimEnd());
    });
    const { content, complete } = extractCompletion(result.content);
    streamBubble.update(content);
    history.push({ role: "assistant", content: result.content });
    currentQuestion = content;
    setStatus("ready");
    await speakIfVoice(content);
    if (complete) {
      await generateFinalReport(false);
    } else {
      await enterCooldownThenResume();
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

  stopTimer();
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
      const pct = Math.max(0, Math.min(10, Number(value) || 0)) * 10;
      item.innerHTML = `
        <div class="report-category-top">
          <span class="report-category-label">${formatLabel(key)}</span>
          <span class="report-category-value">${value}/10</span>
        </div>
        <div class="report-bar-track"><div class="report-bar-fill" style="width:${pct}%"></div></div>`;
      grid.appendChild(item);
    }
    reportContent.appendChild(grid);
  }

  const listSections = [
    ["Strong Areas", data.strong_areas, "strong"],
    ["Weak Areas", data.weak_areas, "weak"],
    ["Questions Missed", data.questions_missed, "neutral"],
    ["Technical Corrections", data.technical_corrections, "neutral"],
    ["Recommended Topics", data.recommended_topics, "neutral"],
  ];

  for (const [label, items, tone] of listSections) {
    if (!items || !items.length) continue;
    const block = document.createElement("div");
    block.className = `report-block report-block-${tone}`;
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

// Streams the reply in as it's generated instead of waiting for the whole
// thing. onDelta is called with each new chunk of text as it arrives so the
// caller can paint it live. Falls back to the plain /chat call (and returns
// its result the same shape: {content, provider, model}) on any failure —
// a slow/broken stream should never mean no answer at all.
async function callChatStream(system, messages, onDelta) {
  let res;
  try {
    res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages }),
    });
  } catch {
    return callChat(system, messages);
  }
  if (!res.ok || !res.body) return callChat(system, messages);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let meta = { provider: null, model: null };
  let gotAnyDelta = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let payload;
          try {
            payload = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (payload.type === "meta") {
            meta = { provider: payload.provider, model: payload.model };
          } else if (payload.type === "delta") {
            content += payload.content;
            gotAnyDelta = true;
            onDelta(content);
          } else if (payload.type === "done") {
            content = payload.content ?? content;
          } else if (payload.type === "error") {
            throw new Error(payload.error || "stream error");
          }
        }
      }
    }
  } catch (err) {
    // If nothing streamed yet, the plain endpoint can still save the turn.
    // If partial content already streamed in, keep it — a broken final
    // chunk of an otherwise-good answer beats discarding it entirely.
    if (!gotAnyDelta) return callChat(system, messages);
  }

  if (!content) return callChat(system, messages);
  return { content, provider: meta.provider, model: meta.model };
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

function bubbleRoleFor(role) {
  if (currentMode === "candidate") {
    return role === "you" ? "you" : "ai-candidate";
  }
  return role === "you" ? "candidate" : role;
}

function labelFor(role) {
  return currentMode === "candidate"
    ? (role === "you" ? "You — Interviewer" : "Adesanya — AI Candidate")
    : (ROLE_LABELS[role] || "You");
}

function scrollToLatest() {
  requestAnimationFrame(() => {
    transcriptEl.scrollTo({ top: transcriptEl.scrollHeight, behavior: "auto" });
    if (jumpLatestBtn) jumpLatestBtn.classList.add("hidden");
  });
}

function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg msg-${bubbleRoleFor(role)}`;
  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = labelFor(role);
  div.appendChild(label);
  div.appendChild(document.createTextNode(content));
  transcriptEl.appendChild(div);
  scrollToLatest();
}

// Creates an empty bubble immediately and returns an updater to paint
// streamed text into it as chunks arrive, instead of waiting for the full
// reply before showing anything.
function addStreamingMessage(role) {
  const div = document.createElement("div");
  div.className = `msg msg-${bubbleRoleFor(role)}`;
  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = labelFor(role);
  div.appendChild(label);
  const textNode = document.createTextNode("");
  div.appendChild(textNode);
  transcriptEl.appendChild(div);
  scrollToLatest();

  return {
    update(fullText) {
      textNode.textContent = fullText;
      scrollToLatest();
    },
  };
}

if (transcriptEl && jumpLatestBtn) {
  transcriptEl.addEventListener("scroll", () => {
    const atBottom = transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight < 40;
    jumpLatestBtn.classList.toggle("hidden", atBottom);
  });
  jumpLatestBtn.addEventListener("click", () => {
    transcriptEl.scrollTo({ top: transcriptEl.scrollHeight, behavior: "smooth" });
    jumpLatestBtn.classList.add("hidden");
  });
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
//
// Driven by an explicit state machine (voiceFSM) instead of loose booleans.
// The state transitions synchronously the instant a decision is made —
// e.g. the moment we decide an utterance is over, voiceFSM flips to
// "transcribing" BEFORE mediaRecorder.stop() is even called. That closes
// the race window that used to exist between "recording just stopped" and
// "we've told the VAD loop to stop listening": previously vadSpeaking was
// reset synchronously but the busy flag wasn't set until submitTurn() ran
// later, after an async transcription round-trip — during that gap the
// loop could see fresh mic input and start a second, overlapping recording.
//
// States: idle | listening | recording | transcribing | generating | cooldown | stopped
// ─────────────────────────────────────────────
let micStream = null;
let audioCtx = null;
let analyserNode = null;
let mediaRecorder = null;
let recordedChunks = [];
let vadRafId = null;
let vadSpeechStart = 0;
let vadSilenceStart = 0;
let vadMaxTimer = null;
let voiceFSM = "idle";
let candidateVoicePaused = false;
let lastProcessedTranscript = ""; // guards against reprocessing the same utterance twice

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startVoiceIfNeeded() {
  if (selectedVoice === "text") return;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  } catch (err) {
    setFSM("idle");
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
  lastProcessedTranscript = "";
  candidateVoicePaused = false;

  if (selectedVoice === "auto") {
    setFSM("listening");
    startVadLoop();
  } else {
    setFSM("idle");
  }
}

function stopVoice() {
  setFSM("stopped");
  TTS.stop();
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
  lastProcessedTranscript = "";
  micBtn.removeEventListener("click", handleMicTap);
  micBtn.classList.remove("active");
}

// Called at the top of submitTurn() for every modality (voice or typed) so
// the mic never listens while a chat request is in flight.
async function pauseListeningWhileBusy() {
  if (vadRafId) cancelAnimationFrame(vadRafId);
  vadRafId = null;
  setFSM("generating");
}

// Used only where there's no response-display cooldown needed (e.g. right
// after a session starts, or after skipping an invalid transcript).
async function resumeListeningIfAuto() {
  if (voiceFSM === "stopped") return;
  if (selectedVoice === "auto" && analyserNode) {
    setFSM("listening");
    startVadLoop();
  } else {
    setFSM("idle");
  }
}

// Used after an AI response has just been displayed — waits briefly before
// re-opening the mic so the turn transition feels deliberate, not jumpy.
async function enterCooldownThenResume() {
  if (voiceFSM === "stopped") return;
  setFSM("cooldown");
  await sleep(COOLDOWN_MS);
  await resumeListeningIfAuto();
}

function setFSM(state) {
  voiceFSM = state;
  setVoiceState(state);
}

function setVoiceState(state) {
  if (!voiceStateEl) return;
  const labels = {
    idle: "Idle",
    listening: "Listening…",
    recording: "Recording…",
    transcribing: "Transcribing…",
    generating: currentMode === "candidate" ? "Adesanya is thinking…" : "Interviewer is preparing the next question…",
    thinking: currentMode === "candidate" ? "Adesanya is thinking…" : "Interviewer is preparing the next question…",
    speaking: "Interviewer is speaking…",
    cooldown: "One moment…",
    ready: "Ready",
    stopped: "Idle",
  };
  voiceStateEl.textContent = labels[state] || "Idle";
  voiceVizEl.classList.toggle("active", state === "listening" || state === "recording" || state === "speaking");
  micBtn.classList.toggle("active", state === "recording");
}

// ── Transcript validation ──────────────────────
// Rejects empty, filler-only, or too-short transcripts so ambient noise or
// a stray "um" never gets sent to the AI. Also rejects an exact repeat of
// the last processed utterance (guards against any residual double-fire).
function isValidTranscript(raw) {
  const text = (raw || "").trim();
  if (!text) return false;
  if (text.length < MIN_MEANINGFUL_CHARS && !text.endsWith("?")) return false;
  if (FILLER_ONLY.test(text)) return false;
  if (text.toLowerCase() === lastProcessedTranscript.toLowerCase()) return false;
  return true;
}

// ── Manual mode ─────────────────────────────────
function handleMicTap() {
  // In AI Candidate voice mode the mic is the bottom-centre conversation
  // control. Manual mode records on press/release; Auto mode toggles listening.
  if (currentMode === "candidate" && selectedVoice === "auto") {
    if (candidateVoicePaused) {
      candidateVoicePaused = false;
      setFSM("listening");
      startVadLoop();
    } else if (voiceFSM === "listening") {
      candidateVoicePaused = true;
      if (vadRafId) cancelAnimationFrame(vadRafId);
      vadRafId = null;
      setFSM("idle");
    }
    return;
  }

  if (selectedVoice !== "manual") return;
  if (voiceFSM === "recording") {
    setFSM("transcribing");
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  } else if (voiceFSM === "idle" || voiceFSM === "listening") {
    setFSM("recording");
    startRecording(async (blob) => {
      await submitAudio(blob);
    });
  }
}

// ── Auto mode (VAD) ────────────────────────────
function startVadLoop() {
  const data = new Uint8Array(analyserNode.fftSize);
  const vad = VAD();

  function tick() {
    if (!analyserNode || selectedVoice !== "auto") return;
    if (currentMode === "candidate" && candidateVoicePaused) return;
    // Only run detection while actually listening or actively recording —
    // any other state means a turn is already in flight, so don't reschedule.
    if (voiceFSM !== "listening" && voiceFSM !== "recording") return;

    analyserNode.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    const now = performance.now();

    if (voiceFSM === "listening") {
      if (rms > vad.SPEECH_START_THRESHOLD) {
        vadSpeechStart = now;
        vadSilenceStart = 0;
        setFSM("recording");
        startRecording(async (blob) => {
          await submitAudio(blob);
        });
        if (vadMaxTimer) clearTimeout(vadMaxTimer);
        vadMaxTimer = setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === "recording") {
            setFSM("transcribing");
            mediaRecorder.stop();
          }
        }, vad.MAX_RECORDING_DURATION);
      }
    } else {
      // voiceFSM === "recording"
      if (rms > vad.SPEECH_START_THRESHOLD) {
        vadSilenceStart = 0;
      } else {
        if (!vadSilenceStart) vadSilenceStart = now;
        const spokeLongEnough = now - vadSpeechStart > vad.MIN_SPEECH_DURATION;
        const quietLongEnough = now - vadSilenceStart > vad.SILENCE_DURATION;
        if (spokeLongEnough && quietLongEnough) {
          if (vadMaxTimer) clearTimeout(vadMaxTimer);
          // Decide + transition BEFORE calling stop() — this is the fix.
          setFSM("transcribing");
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
  // voiceFSM is already "transcribing" by the time we get here (set
  // synchronously at the moment recording was stopped).
  setStatus("thinking", "Processing audio…");
  try {
    const { text } = await transcribeBlob(blob);

    if (!isValidTranscript(text)) {
      // Not an error — just noise, a filler word, or a duplicate. Stay
      // quiet in the transcript and go straight back to listening.
      setStatus("ready");
      await sleep(250);
      await resumeListeningIfAuto();
      return;
    }

    lastProcessedTranscript = text.trim();
    await submitTurn(lastProcessedTranscript);
  } catch (err) {
    addFeedbackError("Couldn't understand that recording. Please try again.");
    setStatus("ready");
    await resumeListeningIfAuto();
  }
}
