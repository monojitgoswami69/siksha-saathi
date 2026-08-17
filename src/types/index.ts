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
  batch?: string;
  semester?: string;
  rollNumber?: string;
  avatar_url?: string;
}

export interface ChatSession {
  session_id: string;
  id: string;
  title: string;
  is_pinned?: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ title: string; page?: number; subject?: string }>;
  created_at?: string;
}

export interface DocumentInfo {
  document_id: string;
  id: string;
  title: string;
  source: string;
  mime_type?: string;
  file_size?: number;
  file_size_bytes?: number;
  stream?: string;
  semester?: string;
  subject?: string;
  module?: string;
  total_chunks: number;
  chunks_count?: number;
  created_at: string;
  uploaded_by?: string;
  dropbox_shared_link?: string;
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
