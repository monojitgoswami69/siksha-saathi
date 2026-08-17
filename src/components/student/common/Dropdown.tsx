'use client';

import React, { useState, useRef, useEffect } from 'react';

interface DropdownOption<T> {
  label: string;
  value: T;
}

interface DropdownProps<T> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
}

export default function Dropdown<T extends string | number>({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  className = '',
  buttonClassName = '',
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && (
        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-white border border-slate-200 text-slate-700 text-[14px] rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#0d47a1]/20 focus:border-[#0d47a1] cursor-pointer hover:border-slate-300 transition-all font-medium shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-md active:scale-[0.99] group ${buttonClassName}`}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <span
          className={`material-symbols-outlined text-slate-400 group-hover:text-[#0d47a1] transition-all duration-300 transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          style={{ fontSize: '20px' }}
        >
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.1)] z-[60] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 ring-1 ring-black/5">
          <div className="max-h-60 overflow-y-auto py-1 scrollbar-hide">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-5 py-2.5 text-[14px] transition-all duration-200 hover:bg-blue-50/80 hover:text-[#0d47a1] flex items-center justify-between group ${
                  option.value === value
                    ? 'bg-blue-50/50 text-[#0d47a1] font-bold'
                    : 'text-slate-600 font-medium'
                }`}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <span
                    className="material-symbols-outlined text-[#0d47a1]"
                    style={{ fontSize: '18px' }}
                  >
                    check
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
