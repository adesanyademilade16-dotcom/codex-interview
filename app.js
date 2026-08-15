// ─────────────────────────────────────────────
// CONFIG — point this at your deployed Render backend
// ─────────────────────────────────────────────
const API_BASE = "https://codex-interview-backend.onrender.com";

// ─────────────────────────────────────────────
// CANDIDATE CONTEXT — kept factual and scoped to what's actually true.
// Edit this if the candidate's real background changes.
// ─────────────────────────────────────────────
const CANDIDATE_CONTEXT = `You are a realistic, professional AI technical interviewer for Codex Interview AI, an educational practice tool. This is strictly practice — never suggest ways to cheat in a real interview, and never imply you are anything other than a practice tool.

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
Run a full interview: start with a short introduction question, then move through HTML/CSS, JavaScript, React, APIs/backend, Git, and one system-thinking scenario, finishing with a short coding question. Move to the next stage once a stage feels sufficiently covered — you don't need an exhaustive checklist. Begin now with your first question; do not wait for the candidate to speak first.`;

function topicSuffix(topic) {
  return `
Focus this entire session only on: ${topic}. Ask progressively harder questions within this topic, drilling into anything the candidate mentions. Begin now with your first question; do not wait for the candidate to speak first.`;
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let systemPrompt = "";
let history = []; // {role: "user"|"assistant", content}
let mentionedTech = new Set();
let currentQuestion = "";

const TECH_KEYWORDS = [
  "React", "TypeScript", "JavaScript", "Supabase", "Firebase", "PostgreSQL",
  "Tailwind", "Figma", "Git", "GitHub", "Vercel", "Netlify", "API", "REST",
  "Node", "Express", "CSS", "HTML", "OAuth", "PWA"
];

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const body = document.body;
const viewDashboard = document.getElementById("view-dashboard");
const viewInterview = document.getElementById("view-interview");
const transcriptEl = document.getElementById("transcript");
const statusEl = document.getElementById("status-line");
const techTrackerEl = document.getElementById("tech-tracker");
const responseForm = document.getElementById("response-form");
const responseInput = document.getElementById("response-input");
const sendBtn = document.getElementById("send-btn");
const reviewBtn = document.getElementById("review-btn");

let lastQuestion = null;
let lastAnswer = null;

document.getElementById("start-full-interview").addEventListener("click", () => {
  beginInterview(CANDIDATE_CONTEXT + FULL_INTERVIEW_SUFFIX);
});

document.querySelectorAll(".topic-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    beginInterview(CANDIDATE_CONTEXT + topicSuffix(btn.dataset.topic));
  });
});

document.getElementById("exit-interview").addEventListener("click", exitInterview);
responseForm.addEventListener("submit", handleSubmit);
reviewBtn.addEventListener("click", handleReview);

// ─────────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────────
function showInterviewView() {
  viewDashboard.classList.add("hidden");
  viewInterview.classList.remove("hidden");
  body.dataset.view = "interview";
}

function showDashboardView() {
  viewInterview.classList.add("hidden");
  viewDashboard.classList.remove("hidden");
  body.dataset.view = "dashboard";
}

function exitInterview() {
  showDashboardView();
  history = [];
  mentionedTech.clear();
  currentQuestion = "";
  lastQuestion = null;
  lastAnswer = null;
  reviewBtn.disabled = true;
  transcriptEl.innerHTML = "";
  techTrackerEl.innerHTML = "";
}

// ─────────────────────────────────────────────
// INTERVIEW FLOW
// ─────────────────────────────────────────────
async function beginInterview(fullSystemPrompt) {
  systemPrompt = fullSystemPrompt;
  history = [];
  mentionedTech.clear();
  transcriptEl.innerHTML = "";
  techTrackerEl.innerHTML = "";
  showInterviewView();
  setStatus("thinking");
  currentQuestion = "";
  lastQuestion = null;
  lastAnswer = null;
  reviewBtn.disabled = true;

  // Kickoff turn — not shown in the transcript, just tells the model to begin.
  const kickoff = [{ role: "user", content: "(interview session started)" }];

  try {
    const result = await callChat(systemPrompt, kickoff);
    addMessage("interviewer", result.content);
    history.push({ role: "assistant", content: result.content });
    currentQuestion = result.content;
    setStatus("ready");
  } catch (err) {
    setStatus("error", "Couldn't reach the interviewer. Check your connection and try again.");
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const text = responseInput.value.trim();
  if (!text) return;

  addMessage("candidate", text);
  history.push({ role: "user", content: text });
  detectTech(text);

  lastQuestion = currentQuestion;
  lastAnswer = text;
  reviewBtn.disabled = false;

  responseInput.value = "";
  sendBtn.disabled = true;
  setStatus("thinking");

  try {
    const result = await callChat(systemPrompt, history);
    addMessage("interviewer", result.content);
    history.push({ role: "assistant", content: result.content });
    currentQuestion = result.content;
    setStatus("ready");
  } catch (err) {
    setStatus("error", "AI is temporarily unavailable. Please try sending that again.");
  } finally {
    sendBtn.disabled = false;
  }
}

async function handleReview() {
  if (!lastAnswer) return;
  reviewBtn.disabled = true;
  reviewBtn.textContent = "Reviewing…";

  try {
    const res = await fetch(`${API_BASE}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: lastQuestion, answer: lastAnswer }),
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

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function addMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg msg-${role}`;
  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = role === "interviewer" ? "Interviewer" : "You";
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
    statusEl.textContent = "Interviewer is thinking…";
  } else if (state === "ready") {
    statusEl.textContent = "Ready";
  } else if (state === "error") {
    statusEl.textContent = "Something went wrong";
  }
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
