'use client';

import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  isStreaming?: boolean;
}

export function ChatInput({ onSendMessage, isStreaming }: ChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const originalInputRef = useRef('');
  const isListeningRef = useRef(false);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let recorded = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            recorded += event.results[i][0].transcript;
          }
          const prefix = originalInputRef.current ? originalInputRef.current + ' ' : '';
          setInputValue(prefix + recorded);
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') {
            return;
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch {
              setIsListening(false);
            }
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech-to-text is not supported in this browser.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      recognitionRef.current.stop();
    } else {
      originalInputRef.current = inputValue;
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Speech recognition error:', e);
      }
    }
  };

  const handleSubmit = () => {
    if (isListening) {
      setIsListening(false);
      try {
        recognitionRef.current?.stop();
      } catch {}
    }
    if (inputValue.trim() && !isStreaming) {
      onSendMessage(inputValue);
      setInputValue('');
      originalInputRef.current = '';
    }
  };

  return (
    <div className="p-6 bg-gradient-to-t from-[#f1f5f9] via-[#f1f5f9] to-transparent absolute bottom-0 w-full z-40 font-chat">
      <div className="max-w-3xl mx-auto clay-card p-2 rounded-[2rem] flex items-center gap-2 border border-white/80 shadow-2xl pl-6">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={
            isListening
              ? 'Listening...'
              : isStreaming
              ? 'Generating response...'
              : 'Message Siksha Saathi...'
          }
          disabled={isStreaming}
          className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-slate-800 placeholder:text-slate-400 py-3 px-2 disabled:opacity-50 font-chat text-sm md:text-base"
          style={{ fontFamily: '"JetBrains Mono", monospace' }}
        />
        <div className="flex items-center gap-2 pr-1">
          <button
            type="button"
            onClick={toggleListening}
            title="Speech to Text"
            className={`p-3 transition-colors rounded-full flex items-center justify-center cursor-pointer ${
              isListening
                ? 'bg-red-50 text-red-500 animate-pulse'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="material-symbols-outlined">
              {isListening ? 'mic' : 'mic_none'}
            </span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isStreaming || !inputValue.trim()}
            className={`p-3 rounded-full transition-all active:scale-90 shadow-md cursor-pointer flex items-center justify-center ${
              isStreaming || !inputValue.trim()
                ? 'bg-slate-400 text-slate-200 cursor-not-allowed'
                : 'bg-[#555f70] text-[#f6f7ff] hover:bg-[#495364]'
            }`}
          >
            <span className="material-symbols-outlined">arrow_upward</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
