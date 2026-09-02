export interface User {
  uid: string;
  email: string;
  displayName: string | null;
  role: string;
  token: string;
  avatar_url?: string | null;
}

export interface UserProfile {
  name?: string;
  roll?: string;
  stream: string;
  sem: string;
  section?: string;
  semester?: string;
  rollNumber?: string;
  avatar_url?: string;
}

export interface ChatSession {
  session_id: string;
  id: string;
  title: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface CitationSource {
  /** Ordinal index (1-based) into the context blocks presented to the LLM */
  n?: number;
  chunk_id?: string;
  document_id?: string;
  title?: string;
  file_name?: string;
  page?: number;
  paragraph_id?: string;
  subject?: string;
  section?: string;
  chunk_type?: 'text' | 'image' | 'table';
  similarity?: number;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: CitationSource[];
  created_at?: string;
}

export interface DocumentInfo {
  document_id: string;
  id: string;
  title: string;
  file_name: string;
  mime_type?: string;
  file_size?: number;
  file_size_bytes?: number;
  stream?: string;
  semester?: string;
  section?: string;
  subject?: string;
  module?: string;
  total_chunks: number;
  chunks_count?: number;
  created_at: string;
  uploaded_by?: string;
}

export interface QuizOption {
  label: string;
  text: string;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: QuizOption[];
  correct_option: string;
  explanation: string;
}

export interface QuizResponse {
  quiz_id: string;
  subject: string;
  num_questions: number;
  questions: QuizQuestion[];
}

export interface QuizHistoryItem {
  quiz_id: string;
  subject: string;
  module?: string;
  score: number;
  total_questions: number;
  percentage: number;
  time_taken_seconds?: number;
  submitted_at: string;
}
