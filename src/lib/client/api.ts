/**
 * Universal Client API Service
 * Connects to Next.js API route handlers (/api/v1/...) with automatic secure cookie transport.
 */

import { DocumentInfo, QuizResponse, QuizHistoryItem, UserProfile } from '@/types';

export const API_BASE_URL = '/api/v1';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status = 500, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function getFallbackToken(scope?: 'student' | 'admin'): string | null {
  if (typeof window === 'undefined') return null;
  if (scope === 'admin') {
    return (
      sessionStorage.getItem('admin_token') ||
      localStorage.getItem('admin_token')
    );
  }
  return (
    sessionStorage.getItem('student_token') ||
    localStorage.getItem('student_token')
  );
}

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {},
  scope?: 'student' | 'admin'
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getFallbackToken(scope);

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  // Optional fallback token attachment (cookies are sent automatically)
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.detail || errorData.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, errorData);
  }

  return res.json();
}

export const api = {
  auth: {
    studentLogin: (email: string, password: string) =>
      request('/student/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    adminLogin: (email: string, password: string) =>
      request('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }, 'admin'),
    googleAuth: (
      payload: string | { idToken?: string; accessToken?: string; scope?: 'student' | 'dashboard' }
    ) =>
      request('/auth/google', {
        method: 'POST',
        body: JSON.stringify(
          typeof payload === 'string' ? { idToken: payload } : payload
        ),
      }),
    getMe: (scope: 'student' | 'admin' = 'student') =>
      request(`/auth/me?scope=${scope}`, { method: 'GET' }, scope),
    updateProfile: (data: any, scope: 'student' | 'admin' = 'student') =>
      request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }, scope),
    logout: (scope?: 'student' | 'admin') => {
      const q = scope ? `?scope=${scope}` : '';
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(scope === 'admin' ? 'admin_token' : 'student_token');
        sessionStorage.removeItem(scope === 'admin' ? 'admin_user_info' : 'student_user_info');
        localStorage.removeItem(scope === 'admin' ? 'admin_token' : 'student_token');
        localStorage.removeItem(scope === 'admin' ? 'admin_user_info' : 'student_user_info');
      }
      return request(`/auth/logout${q}`, { method: 'POST' });
    },
  },

  sessions: {
    list: () => request('/sessions', { method: 'GET' }),
    create: (title = 'New Chat') =>
      request('/sessions', { method: 'POST', body: JSON.stringify({ title }) }),
    delete: (sessionId: string) =>
      request(`/sessions/${sessionId}`, { method: 'DELETE' }),
    update: (sessionId: string, data: { title?: string; is_pinned?: boolean }) =>
      request(`/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    getMessages: (sessionId: string) =>
      request(`/sessions/${sessionId}/messages`, { method: 'GET' }),
  },

  quiz: {
    generate: (
      subject: string,
      num_questions = 5,
      filters?: { document_id?: string; file_name?: string; module?: string }
    ): Promise<QuizResponse> =>
      request('/quiz/generate', {
        method: 'POST',
        body: JSON.stringify({ subject, num_questions, ...filters }),
      }),
    submit: (data: any) =>
      request('/quiz/submit', { method: 'POST', body: JSON.stringify(data) }),
    history: (): Promise<{ quiz_history: QuizHistoryItem[]; total_quizzes: number; average_percentage: number }> =>
      request('/quiz/history', { method: 'GET' }),
  },

  documents: {
    list: (params: { stream?: string; semester?: string; subject?: string } = {}): Promise<{ documents: DocumentInfo[]; total: number }> => {
      const q = new URLSearchParams();
      if (params.stream) q.append('stream', params.stream);
      if (params.semester) q.append('semester', params.semester);
      if (params.subject) q.append('subject', params.subject);
      return request(`/documents?${q.toString()}`, { method: 'GET' });
    },
    ingest: (formData: FormData | object) => {
      const isForm = formData instanceof FormData;
      return request(
        '/ingest',
        {
          method: 'POST',
          body: isForm ? formData : JSON.stringify(formData),
        },
        'admin'
      );
    },
    delete: (docId: string) =>
      request(`/documents/${docId}`, { method: 'DELETE' }, 'admin'),
    update: (docId: string, data: any) =>
      request(`/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(data) }, 'admin'),
    getPreviewUrl: (docId: string): Promise<{ preview_url: string; title: string }> =>
      request(`/documents/${docId}/preview`, { method: 'GET' }),
    getDownloadUrl: (docId: string): Promise<{ download_url: string; title: string }> =>
      request(`/documents/${docId}/download`, { method: 'GET' }),
    download: async (docId: string, filename: string) => {
      const res = await fetch(`/api/v1/documents/${docId}/download`, {
        credentials: 'same-origin',
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
    getContent: (docId: string) =>
      request(`/documents/${docId}/content`, { method: 'GET' }, 'admin'),
    getChunk: (docId: string, chunkId: string): Promise<{
      chunk: any;
      document: any;
      preview_url: string;
    }> => request(`/documents/${docId}/chunks/${chunkId}`, { method: 'GET' }),
  },

  filters: {
    getFilters: () => request('/filters', { method: 'GET' }),
    getCurriculum: (stream?: string, semester?: string) => {
      const q = new URLSearchParams();
      if (stream) q.append('stream', stream);
      if (semester) q.append('semester', semester);
      return request(`/curriculum?${q.toString()}`, { method: 'GET' });
    },
    saveCurriculum: (data: { stream: string; semester: string; subjects: any[] }) =>
      request('/admin/curriculum', { method: 'POST', body: JSON.stringify(data) }, 'admin'),
  },

  admin: {
    dashboard: () => request('/admin/dashboard', { method: 'GET' }, 'admin'),
    enrollStudents: (data: { csv_data: string; initial_password: string }) =>
      request('/admin/enroll_students', { method: 'POST', body: JSON.stringify(data) }, 'admin'),
    getStudents: (params: { stream?: string; semester?: string; section?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.stream) q.append('stream', params.stream);
      if (params.semester) q.append('semester', params.semester);
      if (params.section) q.append('section', params.section);
      return request(`/students?${q.toString()}`, { method: 'GET' }, 'admin');
    },
    createStudent: (data: {
      email: string;
      name: string;
      roll: string;
      stream: string;
      sem: string;
      section: string;
      password: string;
    }) => request('/students', { method: 'POST', body: JSON.stringify(data) }, 'admin'),
    resetStudentPassword: (uid: string, password?: string) =>
      request(`/students/${uid}/password`, { method: 'POST', body: JSON.stringify({ password }) }, 'admin'),
    listFaculty: () => request('/admin/users', { method: 'GET' }, 'admin'),
    createFaculty: (data: {
      email: string;
      password: string;
      displayName: string;
      role: 'admin' | 'hod' | 'faculty';
      department?: string;
      organizationName?: string;
      hodStreams?: string[];
      facultyAssignments?: Array<{ stream: string; semester: string; section: string; subject: string }>;
    }) => request('/admin/users', { method: 'POST', body: JSON.stringify(data) }, 'admin'),
    updateFaculty: (
      uid: string,
      data: {
        displayName?: string;
        role?: 'admin' | 'hod' | 'faculty';
        department?: string;
        organizationName?: string;
        hodStreams?: string[];
        facultyAssignments?: Array<{ stream: string; semester: string; section: string; subject: string }>;
      }
    ) => request(`/admin/users/${uid}`, { method: 'PATCH', body: JSON.stringify(data) }, 'admin'),
    resetFacultyPassword: (uid: string, password: string) =>
      request(
        `/admin/users/${uid}/password`,
        { method: 'POST', body: JSON.stringify({ password }) },
        'admin'
      ),
    deleteFaculty: (uid: string) =>
      request(`/admin/users/${uid}`, { method: 'DELETE' }, 'admin'),
  },

  analytics: {
    overview: (stream?: string) => {
      const q = stream ? `?stream=${stream}` : '';
      return request(`/analytics/overview${q}`, { method: 'GET' }, 'admin');
    },
    stream: (semester?: string) => {
      const q = semester ? `?semester=${semester}` : '';
      return request(`/analytics/stream${q}`, { method: 'GET' }, 'admin');
    },
    subject: (subject: string) =>
      request(`/analytics/subject/${encodeURIComponent(subject)}`, { method: 'GET' }, 'admin'),
    faculty: () =>
      request('/analytics/faculty', { method: 'GET' }, 'admin'),
    student: (uid: string) =>
      request(`/analytics/student/${uid}`, { method: 'GET' }, 'admin'),
  },
};
