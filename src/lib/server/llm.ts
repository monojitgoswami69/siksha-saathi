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
1. **ONLY answer using the Reference Material provided below.** If reference material is empty or unrelated to the question, politely refuse: "I don't have information about this in your course materials."
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
   - You MAY cite multiple sources: \`[[#1]][[#3]]\`.
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
}: {
  userMessage: string;
  contextBlock: string;
  conversationHistory?: Array<{ role: 'user' | 'model' | 'assistant'; content: string }>;
}): Promise<ReadableStream<Uint8Array>> {
  const systemInstruction = contextBlock.trim()
    ? `${SOCRATIC_SYSTEM_INSTRUCTION}\n\n## Reference Material (Course Syllabus & Notes)\n${contextBlock}\n`
    : `${SOCRATIC_SYSTEM_INSTRUCTION}\n\n## Reference Material\n(EMPTY - No relevant course content found. Refuse to answer outside course materials.)\n`;

  if (!apiKey || apiKey.startsWith('dummy')) {
    const mockText = `Hello! I am your Siksha Saathi Socratic tutor.\n\nRegarding your question about "${userMessage}":\n\nWhat is the fundamental principle behind this concept in your course syllabus? [[#1]]`;
    return new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for (const word of mockText.split(' ')) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: word + ' ' })}\n\n`));
          await new Promise((r) => setTimeout(r, 25));
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
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

  const generateFallback = (): QuizQuestionOutput[] => [
    {
      id: 1,
      question: `In the study of ${subject}, what is the primary role of core architectural abstraction?`,
      options: [
        { label: 'A', text: `Managing underlying system resources and operational throughput for ${subject}` },
        { label: 'B', text: 'Displaying static non-interactive visual assets' },
        { label: 'C', text: 'Executing legacy unstructured procedural loops' },
        { label: 'D', text: 'Formatting auxiliary configuration headers' },
      ],
      correct_option: 'A',
      explanation: `Core architectural abstraction coordinates foundational system resources and execution pipelines in ${subject}.`,
    },
    {
      id: 2,
      question: `Which fundamental principle guarantees operational consistency and reliability in ${subject}?`,
      options: [
        { label: 'A', text: 'Unbounded asynchronous side-effects' },
        { label: 'B', text: 'Strict modular encapsulation and verifiable state transitions' },
        { label: 'C', text: 'Linear polling without error recovery' },
        { label: 'D', text: 'Deprecating distributed transaction boundaries' },
      ],
      correct_option: 'B',
      explanation: 'Modular encapsulation and deterministic state transitions ensure predictable and verifiable runtime execution.',
    },
    {
      id: 3,
      question: `When optimizing algorithmic performance in ${subject}, what is the primary objective?`,
      options: [
        { label: 'A', text: 'Minimizing asymptotic time and space complexity' },
        { label: 'B', text: 'Maximizing redundant memory buffer allocations' },
        { label: 'C', text: 'Increasing arbitrary thread preemption cycles' },
        { label: 'D', text: 'Eliminating all indexing data structures' },
      ],
      correct_option: 'A',
      explanation: 'Algorithmic efficiency is measured by reducing asymptotic computational complexity (Big-O) in time and memory.',
    },
    {
      id: 4,
      question: `In modern engineering practice for ${subject}, how is fault tolerance best achieved?`,
      options: [
        { label: 'A', text: 'Single points of failure with no replication' },
        { label: 'B', text: 'Redundancy, graceful degradation, and structured exception handling' },
        { label: 'C', text: 'Ignoring downstream network timeouts' },
        { label: 'D', text: 'Hardcoding static credentials across components' },
      ],
      correct_option: 'B',
      explanation: 'Fault tolerance relies on defensive error boundaries, replication, and graceful service degradation under load.',
    },
    {
      id: 5,
      question: `What represents the standard verification lifecycle in ${subject}?`,
      options: [
        { label: 'A', text: 'Unit validation, integration testing, and formal benchmarking' },
        { label: 'B', text: 'Manual ad-hoc testing exclusively in production' },
        { label: 'C', text: 'Bypassing regression checks for major releases' },
        { label: 'D', text: 'Disabling automated continuous integration pipelines' },
      ],
      correct_option: 'A',
      explanation: 'Formal verification combines comprehensive unit suites, integration testing, and performance profiling.',
    },
  ].slice(0, Math.max(numQuestions, 3));

  if (!apiKey || apiKey.startsWith('dummy')) {
    return generateFallback();
  }

  const contextPayload =
    contextText || (contextChunks ? contextChunks.join('\n\n--- Chunk ---\n\n') : subject);

  const prompt = `Generate exactly ${numQuestions} multiple-choice questions for college students studying "${subject}".
Return a JSON array of objects. Each object must have:
- "id": integer (1, 2, 3...)
- "question": string (clear question text)
- "options": array of 4 objects [{ "label": "A", "text": "..." }, { "label": "B", "text": "..." }, { "label": "C", "text": "..." }, { "label": "D", "text": "..." }]
- "correct_option": string ("A", "B", "C", or "D")
- "explanation": string (brief academic rationale)

Reference Course Material:
${contextPayload.substring(0, 8000)}`;

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const result = await Promise.race([
      callWithRetry(() => model.generateContent(prompt)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini quiz generation timed out')), 12000)
      ),
    ]);

    const text = result.response.text();
    const parsed = JSON.parse(text);
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;

    if (Array.isArray(questions) && questions.length > 0) {
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
  } catch (err: any) {
    console.error(`Gemini Quiz Generation failed (${modelName}):`, err.message || err);
  }

  return generateFallback();
}

export const generateQuizStructured = generateQuizQuestions;
