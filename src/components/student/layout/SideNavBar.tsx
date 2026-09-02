'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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

  // Pinned chats: strictly First-Come First-Served (earlier pins stay higher -> ASCENDING)
  const pinnedChats = useMemo(() => {
    return (chats || [])
      .filter((c) => c.is_pinned)
      .sort((a, b) => {
        const pinA = new Date(a.pinned_at || a.created_at || 0).getTime();
        const pinB = new Date(b.pinned_at || b.created_at || 0).getTime();
        return pinA - pinB;
      });
  }, [chats]);

  // Recent (unpinned) chats: most recently active first -> DESCENDING
  const recentChats = useMemo(() => {
    return (chats || [])
      .filter((c) => !c.is_pinned)
      .sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
        return timeB - timeA;
      });
  }, [chats]);

  const [pinnedChatsOpen, setPinnedChatsOpen] = useState(true);
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
    <aside className="w-[245px] flex-shrink-0 h-full flex flex-col pt-6 pb-4 px-2 z-50 bg-white font-body text-sm font-medium border-r border-slate-200/80">
      {/* Profile Section */}
      <div className="flex flex-col items-center mb-3">
        <div className="relative w-14 h-14 rounded-full flex items-center justify-center mb-1.5 shadow-xs">
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}&backgroundColor=b6e3f4`}
            alt="Profile"
            className="object-cover rounded-full w-full h-full"
          />
        </div>
        <h2 className="text-sm font-bold text-slate-800 mt-0.5">{displayName}</h2>
        <p className="text-[10px] font-medium text-slate-400 tracking-wider uppercase mt-0.5 max-w-[190px] truncate">
          {profile
            ? `Sem ${profile.sem || profile.semester || '1'} • ${profile.stream || 'CSE'}`
            : 'Fetching Details...'}
        </p>
      </div>

      {/* Primary CTA */}
      <div className="px-3 mb-2.5">
        <button
          onClick={handleNewChatClick}
          className="flex items-center justify-center gap-2 w-full bg-slate-800 text-white py-2 rounded-xl font-semibold text-xs hover:bg-slate-700 transition-all active:scale-98 cursor-pointer shadow-xs"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>New Chat</span>
        </button>
      </div>

      {/* Navigation Scrollable Area */}
      <nav className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-3 px-3 scrollbar-hide">
          {/* Pinned Chats Section (only shown when pinned chats exist) */}
          {pinnedChats.length > 0 && (
            <div className="mt-0">
              <button
                onClick={() => setPinnedChatsOpen(!pinnedChatsOpen)}
                className="relative flex items-center justify-center w-full px-4 py-2 text-slate-500 text-xs font-semibold uppercase tracking-wider transition-all group cursor-pointer hover:text-slate-700 hover:bg-slate-50/30 rounded-lg"
              >
                <span>Pinned chats</span>
                <span
                  className={`material-symbols-outlined text-[16px] absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity ${
                    pinnedChatsOpen ? 'rotate-180' : ''
                  }`}
                >
                  expand_more
                </span>
              </button>

              {pinnedChatsOpen && (
                <div className="space-y-0.5 mt-1">
                  {pinnedChats.map((chat) => (
                    <div
                      key={chat.id}
                      className="relative group flex items-center w-full rounded-xl"
                    >
                      <button
                        onClick={() => handleSelectChatClick(chat.id)}
                        className={`flex items-center w-full pl-4 pr-10 py-1.5 rounded-xl transition-all hover:translate-x-1 duration-200 cursor-pointer ${
                          currentChatId === chat.id
                            ? 'bg-blue-100/30 text-slate-700 font-semibold'
                            : 'text-slate-400 hover:bg-slate-100/50 hover:text-slate-600'
                        }`}
                      >
                        <span className="text-sm truncate whitespace-nowrap flex-1 text-left">
                          {chat.title || 'General Discussion'}
                        </span>
                      </button>

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
                            <span>Unpin</span>
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
                  ))}
                </div>
              )}
            </div>
          )}

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
                {recentChats && recentChats.length > 0 ? (
                  recentChats.map((chat) => (
                    <div
                      key={chat.id}
                      className="relative group flex items-center w-full rounded-xl"
                    >
                      <button
                        onClick={() => handleSelectChatClick(chat.id)}
                        className={`flex items-center w-full pl-4 pr-10 py-1.5 rounded-xl transition-all hover:translate-x-1 duration-200 cursor-pointer ${
                          currentChatId === chat.id
                            ? 'bg-blue-100/30 text-slate-700 font-semibold'
                            : 'text-slate-400 hover:bg-slate-100/50 hover:text-slate-600'
                        }`}
                      >
                        <span className="text-sm truncate whitespace-nowrap flex-1 text-left">
                          {chat.title || 'General Discussion'}
                        </span>
                      </button>

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
                            <span>Pin</span>
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
