'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import TopAppBar from '@/components/student/layout/TopAppBar';
import ChatArea from '@/components/student/chat/ChatArea';
import ChatInput from '@/components/student/chat/ChatInput';
import { useChat } from '@/context/ChatContext';
import { useStudentAuth } from '@/context/StudentAuthContext';

export default function ChatPage() {
  const searchParams = useSearchParams();
  const documentId = searchParams?.get('document_id') || undefined;

  const { user, profile } = useStudentAuth();
  const { chats, currentChatId, isStreaming, handleSendMessage } = useChat();

  const currentChat = chats.find((c) => c.id === currentChatId);
  const currentMessages = currentChat?.messages || [];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50">
      <TopAppBar title={currentChat?.title || 'Socratic AI Tutor'} />
      <ChatArea
        messages={currentMessages}
        isStreaming={isStreaming}
        userName={profile?.name || user?.displayName || 'Student'}
        userEmail={user?.email}
      />
      <ChatInput
        onSendMessage={(text) =>
          handleSendMessage(text, documentId ? { document_id: documentId } : undefined)
        }
        isStreaming={isStreaming}
      />
    </div>
  );
}
