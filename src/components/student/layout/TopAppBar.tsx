'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useStudentAuth } from '@/context/StudentAuthContext';
import ProfileModal from '../profile/ProfileModal';

interface TopAppBarProps {
  title?: string;
}

export function TopAppBar({ title }: TopAppBarProps = {}) {
  const { user, logout } = useStudentAuth();
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSearchExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchExpanded]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  return (
    <>
      <header className="flex justify-between items-center px-8 py-4 w-full bg-[#f1f5f9]/80 backdrop-blur-md sticky top-0 z-40 flex-shrink-0">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold text-slate-900 font-body tracking-wide">
            Siksha Saathi
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Search"
              onClick={() => setIsSearchExpanded((prev) => !prev)}
              className={`p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-full transition-all duration-300 cursor-pointer flex items-center justify-center ${
                isSearchExpanded ? 'translate-x-0' : 'translate-x-3'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">search</span>
            </button>
            <div
              className={`ml-2 overflow-hidden transition-all duration-300 ease-in-out ${
                isSearchExpanded ? 'w-64 opacity-100' : 'w-0 opacity-0'
              }`}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder="Search chat..."
                onBlur={() => !inputRef.current?.value && setIsSearchExpanded(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && !inputRef.current?.value) {
                    setIsSearchExpanded(false);
                  }
                }}
                className="w-full bg-transparent border-0 border-b border-slate-400 focus:border-slate-600 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none pb-1 font-chat"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 rounded-full transition-colors active:scale-95 duration-200 cursor-pointer flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[24px]">person</span>
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div
              ref={menuRef}
              className="absolute top-16 right-8 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50 w-40 animate-in fade-in zoom-in-95 duration-150 font-body"
            >
              <button
                onClick={() => {
                  setProfileModalOpen(true);
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">person</span>
                <span className="text-sm font-medium">Profile</span>
              </button>
              <div className="border-t border-slate-100"></div>
              <button
                onClick={() => {
                  logout();
                  setIsMenuOpen(false);
                }}
                className="w-full px-4 py-3 text-left text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                <span className="text-sm font-medium">Log out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </>
  );
}

export default TopAppBar;
