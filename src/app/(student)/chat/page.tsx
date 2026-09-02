'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TopAppBar from '@/components/student/layout/TopAppBar';
import ChatArea from '@/components/student/chat/ChatArea';
import ChatInput from '@/components/student/chat/ChatInput';
import { useChat } from '@/context/ChatContext';
import { useStudentAuth } from '@/context/StudentAuthContext';

function ChatContent() {
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
        onSendMessage={(text, filter) =>
          handleSendMessage(text, {
            document_id: filter?.document_id,
            subject: filter?.subject,
            file_name: filter?.file_name,
            module: filter?.module,
          })
        }
        isStreaming={isStreaming}
        presetDocumentId={documentId}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="w-8 h-8 border-3 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
        </div>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
