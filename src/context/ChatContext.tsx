'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ChatSession, ChatMessage } from '@/types';
import { api } from '@/lib/client/api';
import { useStudentAuth } from './StudentAuthContext';

export interface ChatItem extends ChatSession {
  messages: ChatMessage[];
}

interface ChatContextValue {
  chats: ChatItem[];
  currentChatId: string | null;
  isStreaming: boolean;
  isInitialLoading: boolean;
  handleNewChat: (title?: string) => Promise<string | null>;
  handleSelectChat: (chatId: string) => void;
  handleSendMessage: (text: string, contextFilter?: { document_id?: string; subject?: string }) => Promise<void>;
  handlePinChat: (chatId: string) => Promise<void>;
  handleDeleteChat: (chatId: string) => Promise<void>;
  initializeChats: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isAuthenticated } = useStudentAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const initializeChats = useCallback(async () => {
    if (!isAuthenticated) {
      setChats([]);
      setCurrentChatId(null);
      setIsInitialLoading(false);
      return;
    }

    try {
      setIsInitialLoading(true);
      const res = await api.sessions.list();
      const sessions = res.sessions || [];

      if (sessions.length > 0) {
        const loadedChats: ChatItem[] = sessions.map((s: any) => ({
          ...s,
          id: s.session_id || s.id,
          session_id: s.session_id || s.id,
          messages: [],
        }));

        setChats(loadedChats);
        setCurrentChatId(loadedChats[0].id);

        // Fetch messages for active session
        try {
          const msgRes = await api.sessions.getMessages(loadedChats[0].id);
          const msgs = msgRes.messages || [];
          setChats((prev) =>
            prev.map((c) => (c.id === loadedChats[0].id ? { ...c, messages: msgs } : c))
          );
        } catch {}
      } else {
        // Create initial session
        const newSession = await api.sessions.create('Welcome Chat');
        const initialChat: ChatItem = {
          ...newSession,
          id: newSession.session_id,
          messages: [
            {
              role: 'assistant',
              content: `Hello ${user?.displayName || 'Student'}! 👋 I am **Siksha Saathi**, your AI Socratic Academic Tutor.\n\nAsk me any concept, equation, or topic from your course syllabus and I'll help guide your understanding!`,
            },
          ],
        };
        setChats([initialChat]);
        setCurrentChatId(initialChat.id);
      }
    } catch (err) {
      console.error('Failed to initialize chats:', err);
    } finally {
      setIsInitialLoading(false);
    }
  }, [isAuthenticated, user?.displayName]);

  useEffect(() => {
    if (isAuthenticated) {
      initializeChats();
    }
  }, [isAuthenticated, initializeChats]);

  const handleSelectChat = async (chatId: string) => {
    setCurrentChatId(chatId);
    const existing = chats.find((c) => c.id === chatId);
    if (existing && existing.messages.length === 0) {
      try {
        const msgRes = await api.sessions.getMessages(chatId);
        const msgs = msgRes.messages || [];
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, messages: msgs } : c))
        );
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    }
  };

  const handleNewChat = async (title = 'New Chat'): Promise<string | null> => {
    try {
      const newSession = await api.sessions.create(title);
      const newChat: ChatItem = {
        ...newSession,
        id: newSession.session_id,
        messages: [
          {
            role: 'assistant',
            content: `New session started. What topic or doubt would you like to explore today?`,
          },
        ],
      };

      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      return newChat.id;
    } catch (err) {
      console.error('Failed to create new chat:', err);
      return null;
    }
  };

  const handlePinChat = async (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const newPinned = !chat.is_pinned;
    try {
      await api.sessions.update(chatId, { is_pinned: newPinned });
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, is_pinned: newPinned } : c))
      );
    } catch (err) {
      console.error('Failed to pin chat:', err);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await api.sessions.delete(chatId);
      const remaining = chats.filter((c) => c.id !== chatId);
      setChats(remaining);
      if (currentChatId === chatId) {
        setCurrentChatId(remaining[0]?.id || null);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleSendMessage = async (
    text: string,
    contextFilter?: { document_id?: string; subject?: string }
  ) => {
    if (!text.trim() || isStreaming) return;

    let targetChatId = currentChatId;
    if (!targetChatId) {
      targetChatId = await handleNewChat(text.slice(0, 30));
      if (!targetChatId) return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    // Add user message to UI immediately
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: [...c.messages, userMessage] } : c
      )
    );

    // Prepare placeholder assistant message
    const placeholderAssistant: ChatMessage = {
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: [...c.messages, placeholderAssistant] } : c
      )
    );

    setIsStreaming(true);

    try {
      const activeChat = chats.find((c) => c.id === targetChatId);
      const history = (activeChat?.messages || []).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const token = sessionStorage.getItem('student_token') || localStorage.getItem('student_token');
      const response = await fetch('/api/v1/query/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          session_id: targetChatId,
          stream: profile?.stream,
          semester: profile?.sem,
          document_id: contextFilter?.document_id,
          subject: contextFilter?.subject,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error(`Streaming failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let accumulated = '';
      let streamSources: Array<{ title: string; page?: number; subject?: string }> = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              // Capture source metadata from first SSE event
              if (parsed.sources && Array.isArray(parsed.sources)) {
                streamSources = parsed.sources;
              }
              if (parsed.text) {
                accumulated += parsed.text;
                setChats((prev) =>
                  prev.map((c) => {
                    if (c.id !== targetChatId) return c;
                    const msgs = [...c.messages];
                    const lastIdx = msgs.length - 1;
                    if (lastIdx >= 0) {
                      msgs[lastIdx] = {
                        ...msgs[lastIdx],
                        content: accumulated,
                        sources: streamSources.length > 0 ? streamSources : undefined,
                      };
                    }
                    return { ...c, messages: msgs };
                  })
                );
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== targetChatId) return c;
          const msgs = [...c.messages];
          const lastIdx = msgs.length - 1;
          if (lastIdx >= 0) {
            msgs[lastIdx] = {
              ...msgs[lastIdx],
              content: `⚠️ Sorry, I encountered an issue: ${err.message}. Please try asking again.`,
            };
          }
          return { ...c, messages: msgs };
        })
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        chats,
        currentChatId,
        isStreaming,
        isInitialLoading,
        handleNewChat,
        handleSelectChat,
        handleSendMessage,
        handlePinChat,
        handleDeleteChat,
        initializeChats,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
