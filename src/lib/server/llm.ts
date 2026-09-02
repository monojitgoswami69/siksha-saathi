/**
 * Google Gemini LLM Service with Exponential Backoff Resilience & Citation Support
 * Powers Socratic streaming RAG chat and structured JSON quiz generation.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Exponential backoff retry utility with jitter for Gemini API calls
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 750
): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.status === 503 ||
        err?.message?.includes('503');

      if (!isRateLimit || attempt >= maxRetries) {
        throw err;
      }

      // Exponential backoff with random jitter
      const jitter = Math.random() * 200;
      const delay = Math.pow(2, attempt) * baseDelayMs + jitter;
      console.warn(`[Gemini RateLimit] Retry ${attempt}/${maxRetries} in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Maximum Gemini API retry attempts exceeded');
}

export const SOCRATIC_SYSTEM_INSTRUCTION = `You are Siksha Saathi, an expert Socratic tutor for college students.

## CRITICAL RULES
1. **Answer using the Reference Material provided below.** If the reference material is completely empty (no blocks), politely refuse: "I don't have information about this in your course materials." If the material is even tangentially related to the question, use it to guide your response — do NOT refuse just because the material covers a specific subtopic rather than the broad question.
2. **USE THE SOCRATIC METHOD BY DEFAULT.**
   - Ask probing, thought-provoking questions to guide the student to discover the answer themselves.
   - Do NOT simply give away the direct answer immediately unless:
      a) The student explicitly requests direct answers ("just tell me", "explain directly", "give me the answer").
      b) The student has already answered your guiding questions (acknowledge and reward effort).
      c) It is a purely factual syntax/definition lookup.
      d) The student expresses frustration or asks for clarification.
3. **Teach Naturally.** Never say "according to the context provided" or reveal your backend retrieval mechanics.
4. **Citations & References:** Each Reference Material block below is labeled with an ordinal tag like \`[#1]\`, \`[#2]\`, etc. Whenever you state a fact, definition, theorem, equation, or any idea drawn from the reference material, append the matching ordinal citation immediately after the claim using this exact syntax:
   \`[[#1]]\` (or \`[[#2]]\`, \`[[#3]]\`, etc.).
   - Strictly cite ONLY the exact Reference Material block where the answer or definition is written. Never cite tangential or background blocks.
   - You MAY cite multiple sources ONLY if the answer spans multiple blocks: \`[[#1]][[#3]]\`.
   - Place the citation at the END of the sentence or clause it supports, before the period where natural.
   - Only cite ordinals that actually exist in the provided Reference Material. Never fabricate a citation.
5. **Formatting:** Use clean markdown, bolding, code blocks with syntax highlighting, and bullet points when explaining.
6. **Conciseness:** Keep guiding questions crisp and targeted.`;

/**
 * Sanitizes conversation history for Gemini SDK requirements
 */
function sanitizeHistory(
  conversationHistory: Array<{ role: 'user' | 'model' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> {
  const sanitized: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }> = [];
  let expectedRole: 'user' | 'model' = 'user';

  for (const msg of conversationHistory) {
    const role: 'user' | 'model' =
      msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';

    if (role === expectedRole && msg.content && msg.content.trim()) {
      sanitized.push({
        role,
        parts: [{ text: msg.content.trim() }],
      });
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }

  if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'user') {
    sanitized.pop();
  }

  return sanitized;
}

/**
 * Streams Socratic chat response using Gemini with model configured from ENV
 */
export async function streamSocraticChat({
  userMessage,
  contextBlock,
  conversationHistory = [],
  isFirstMessage = false,
}: {
  userMessage: string;
  contextBlock: string;
  conversationHistory?: Array<{ role: 'user' | 'model' | 'assistant'; content: string }>;
  isFirstMessage?: boolean;
}): Promise<ReadableStream<Uint8Array>> {
  let sessionNamingPrompt = '';
  if (isFirstMessage) {
    sessionNamingPrompt = `
## FIRST MESSAGE SESSION NAMING:
This is the very first question/message of this new study session. In addition to answering the student's question, you MUST determine a short, concise, and descriptive session name (2 to 5 words maximum, in Title Case, summarizing the core academic topic or question being discussed, e.g., "Compiler Design Basics", "Process Synchronization", "Java Inheritance", "Database Normalization").
Output it at the very end of your response on a new line strictly in this format:
<!-- SESSION_NAME: Your Concise Topic Name -->
Example:
<!-- SESSION_NAME: Compiler Architecture Basics -->
`;
  }

  const baseInstruction = contextBlock.trim()
    ? `${SOCRATIC_SYSTEM_INSTRUCTION}\n\n## Reference Material (Course Syllabus & Notes)\n${contextBlock}\n`
    : `${SOCRATIC_SYSTEM_INSTRUCTION}\n\n## Reference Material\n(EMPTY - No relevant course content found. Refuse to answer outside course materials.)\n`;

  const systemInstruction = `${baseInstruction}\n${sessionNamingPrompt}`;

  if (!apiKey || apiKey.startsWith('dummy')) {
    throw new Error('GEMINI_API_KEY is not configured. Cannot process chat requests.');
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const sanitizedHistory = sanitizeHistory(conversationHistory);

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const chat = model.startChat({
      history: sanitizedHistory,
    });

    const result = await callWithRetry(() => chat.sendMessageStream(userMessage));

    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        } catch (err: any) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`)
          );
          controller.close();
        }
      },
    });
  } catch (err: any) {
    console.error(`Gemini Chat Stream Error with ${modelName}:`, err);
    throw err;
  }
}

export interface QuizQuestionOutput {
  id: number;
  question: string;
  options: Array<{ label: string; text: string }>;
  correct_option: string;
  explanation: string;
}

/**
 * Generate structured MCQs from course materials with retry resilience and fallback
 */
function parseQuizJson(rawText: string): any[] {
  let clean = rawText.trim();

  // Strip markdown code fences if wrapped
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  // 1. Direct parse attempt
  try {
    const direct = JSON.parse(clean);
    const list = Array.isArray(direct) ? direct : direct.questions;
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {}

  // 2. Fix unescaped control characters inside string values
  try {
    const sanitized = clean.replace(/[\x00-\x1F\x7F]/g, (char) => {
      if (char === '\n') return '\\n';
      if (char === '\r') return '\\r';
      if (char === '\t') return '\\t';
      return '';
    });
    const parsed = JSON.parse(sanitized);
    const list = Array.isArray(parsed) ? parsed : parsed.questions;
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {}

  // 3. Truncation repair: If the model hit max tokens and was cut off mid-JSON
  const lastCloseBrace = clean.lastIndexOf('}');
  if (lastCloseBrace !== -1) {
    let truncated = clean.substring(0, lastCloseBrace + 1).trim();
    if (truncated.startsWith('[') && !truncated.endsWith(']')) {
      truncated += ']';
    } else if (!truncated.startsWith('[') && truncated.includes('[')) {
      const openBracket = truncated.indexOf('[');
      truncated = truncated.substring(openBracket) + ']';
    }
    try {
      const parsed = JSON.parse(truncated);
      const list = Array.isArray(parsed) ? parsed : parsed.questions;
      if (Array.isArray(list) && list.length > 0) return list;
    } catch {}
  }

  // 4. Regex extraction of individual valid question objects
  const recovered: any[] = [];
  const questionRegex = /\{[^{}]*"question"\s*:\s*"[^"]*"[^{}]*"options"\s*:\s*\[[^{}[\]]*\][^{}]*"correct_option"\s*:\s*"[ABCD]"[^{}]*\}/g;
  let match;
  while ((match = questionRegex.exec(clean)) !== null) {
    try {
      recovered.push(JSON.parse(match[0]));
    } catch {}
  }
  if (recovered.length > 0) return recovered;

  // Final fallback: standard parse
  const fallback = JSON.parse(clean);
  return Array.isArray(fallback) ? fallback : fallback.questions || [];
}

export async function generateQuizQuestions({
  subject,
  numQuestions = 5,
  contextChunks,
  contextText,
}: {
  subject: string;
  numQuestions?: number;
  contextChunks?: string[];
  contextText?: string;
}): Promise<QuizQuestionOutput[]> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey || apiKey.startsWith('dummy')) {
    throw new Error('GEMINI_API_KEY is not configured. Cannot generate quiz questions.');
  }

  const contextPayload =
    contextText || (contextChunks ? contextChunks.join('\n\n--- Chunk ---\n\n') : subject);

  const prompt = `Generate exactly ${numQuestions} multiple-choice questions for college students studying "${subject}".
Return a strict JSON array of objects. Each object must have:
- "id": integer (1, 2, 3...)
- "question": string (clear question text, escaping any inner quotes)
- "options": array of 4 objects [{ "label": "A", "text": "..." }, { "label": "B", "text": "..." }, { "label": "C", "text": "..." }, { "label": "D", "text": "..." }]
- "correct_option": string ("A", "B", "C", or "D")
- "explanation": string (brief 1-2 sentence academic rationale)

Reference Course Material:
${contextPayload.substring(0, 6000)}`;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const result = await Promise.race([
    callWithRetry(() => model.generateContent(prompt)),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini quiz generation timed out after 30s')), 30000)
    ),
  ]);

  const text = result.response.text();
  const questions = parseQuizJson(text);

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Gemini returned no quiz questions. Please try again.');
  }

  return questions.map((q: any, idx: number) => ({
    id: idx + 1,
    question: q.question || `Question ${idx + 1} on ${subject}`,
    options: Array.isArray(q.options) && q.options.length === 4
      ? q.options.map((opt: any, optIdx: number) => ({
          label: opt.label || ['A', 'B', 'C', 'D'][optIdx],
          text: typeof opt === 'string' ? opt : opt.text || `Option ${['A', 'B', 'C', 'D'][optIdx]}`,
        }))
      : [
          { label: 'A', text: 'Option A' },
          { label: 'B', text: 'Option B' },
          { label: 'C', text: 'Option C' },
          { label: 'D', text: 'Option D' },
        ],
    correct_option: ['A', 'B', 'C', 'D'].includes(q.correct_option?.toUpperCase())
      ? q.correct_option.toUpperCase()
      : 'A',
    explanation: q.explanation || `Correct answer for question ${idx + 1}.`,
  }));
}

export const generateQuizStructured = generateQuizQuestions;
