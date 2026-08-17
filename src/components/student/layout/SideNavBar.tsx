'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useStudentAuth } from '@/context/StudentAuthContext';
import { useChat } from '@/context/ChatContext';

export function SideNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile } = useStudentAuth();
  const {
    chats,
    currentChatId,
    handleNewChat,
    handleSelectChat,
    handlePinChat,
    handleDeleteChat,
  } = useChat();

  const [recentChatsOpen, setRecentChatsOpen] = useState(true);
  const [activeMenuChatId, setActiveMenuChatId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuChatId(null);
      }
    };
    if (activeMenuChatId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuChatId]);

  const handleNewChatClick = async () => {
    await handleNewChat();
    if (pathname !== '/chat') router.push('/chat');
  };

  const handleSelectChatClick = (id: string) => {
    handleSelectChat(id);
    if (pathname !== '/chat') router.push('/chat');
  };

  const handlePinClick = async (chatId: string) => {
    await handlePinChat(chatId);
    setActiveMenuChatId(null);
  };

  const handleDeleteClick = async (chatId: string) => {
    await handleDeleteChat(chatId);
    setActiveMenuChatId(null);
  };

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Student';
  const avatarSeed = user?.email || 'default';

  return (
    <aside className="w-[280px] flex-shrink-0 h-full flex flex-col pt-10 pb-6 px-2 z-50 bg-white font-body text-sm font-medium border-r border-slate-200">
      {/* Profile Section */}
      <div className="flex flex-col items-center mb-4">
        <div className="relative w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center mb-2">
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}&backgroundColor=b6e3f4`}
            alt="Profile"
            className="object-cover rounded-full w-full h-full"
          />
        </div>
        <h2 className="text-[1rem] font-bold text-slate-600 mt-0.5">{displayName}</h2>
        <p className="text-[9px] font-bold text-slate-400 tracking-widest uppercase mt-0.5 max-w-[200px] truncate">
          {profile
            ? `Sem: ${profile.sem || profile.semester || '1'} • ${profile.stream || 'CSE'}`
            : 'Fetching Details...'}
        </p>
      </div>

      {/* Primary CTA */}
      <div className="px-5 mb-3">
        <button
          onClick={handleNewChatClick}
          className="flex items-center justify-center gap-2 w-full bg-slate-800 text-white py-2 rounded-xl font-bold hover:bg-slate-700 transition-all active:scale-95 cursor-pointer shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span className="text-sm">New Chat</span>
        </button>
      </div>

      {/* Navigation Scrollable Area */}
      <nav className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3 px-3 scrollbar-hide">
          {/* Recent Chats Section */}
          <div className="mt-0">
            <button
              onClick={() => setRecentChatsOpen(!recentChatsOpen)}
              className="relative flex items-center justify-center w-full px-4 py-2 text-slate-500 text-xs font-semibold uppercase tracking-wider transition-all group cursor-pointer hover:text-slate-700 hover:bg-slate-50/30 rounded-lg"
            >
              <span>Recent chats</span>
              <span
                className={`material-symbols-outlined text-[16px] absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity ${
                  recentChatsOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>

            {recentChatsOpen && (
              <div className="space-y-0.5 mt-1">
                {chats && chats.length > 0 ? (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      className="relative group flex items-center w-full rounded-xl"
                    >
                      <button
                        onClick={() => handleSelectChatClick(chat.id)}
                        className={`flex items-center w-full pl-4 pr-16 py-1.5 rounded-xl transition-all hover:translate-x-1 duration-200 cursor-pointer ${
                          currentChatId === chat.id
                            ? 'bg-blue-100/30 text-slate-700 font-semibold'
                            : 'text-slate-400 hover:bg-slate-100/50 hover:text-slate-600'
                        }`}
                      >
                        <span className="text-sm truncate whitespace-nowrap flex-1 text-left">
                          {chat.title || 'General Discussion'}
                        </span>
                      </button>

                      {chat.is_pinned && (
                        <span
                          className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 rotate-45 text-slate-400 leading-none transition-transform duration-200 group-hover:-translate-x-7"
                          style={{
                            fontSize: '10px',
                            fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20",
                          }}
                        >
                          push_pin
                        </span>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuChatId(
                            activeMenuChatId === chat.id ? null : chat.id
                          );
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          more_horiz
                        </span>
                      </button>

                      {activeMenuChatId === chat.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-slate-200 z-50 w-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        >
                          <button
                            onClick={() => handlePinClick(chat.id)}
                            className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 text-sm transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              push_pin
                            </span>
                            <span>{chat.is_pinned ? 'Unpin' : 'Pin'}</span>
                          </button>
                          <button
                            onClick={() => handleDeleteClick(chat.id)}
                            className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm transition-colors border-t border-slate-100 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              delete
                            </span>
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-2 text-xs text-slate-300 italic text-center">
                    No recent chats
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Study Resources */}
        <div className="px-3 py-3 space-y-3 border-t border-slate-100">
          <div className="px-4 py-2 text-slate-500 text-xs font-semibold uppercase tracking-wider text-center flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[16px]">menu_book</span>
            <span> Study Resources </span>
          </div>

          <div className="space-y-0.5">
            <Link
              href="/resources"
              className={`flex items-center gap-3 px-4 py-1.5 rounded-xl transition-all hover:translate-x-1 duration-200 ${
                pathname === '/resources'
                  ? 'bg-blue-100/30 text-slate-700 font-semibold'
                  : 'text-slate-400 hover:bg-slate-100/50 hover:text-slate-600'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">library_books</span>
              <span className="text-sm font-medium">Study Materials</span>
            </Link>
            <Link
              href="/exam"
              className={`flex items-center gap-3 px-4 py-1.5 rounded-xl transition-all hover:translate-x-1 duration-200 ${
                pathname.startsWith('/exam')
                  ? 'bg-blue-100/30 text-slate-700 font-semibold'
                  : 'text-slate-400 hover:bg-slate-100/50 hover:text-slate-600'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">quiz</span>
              <span className="text-sm font-medium">Exam Preparation</span>
            </Link>
          </div>
        </div>
      </nav>
    </aside>
  );
}

export default SideNavBar;
