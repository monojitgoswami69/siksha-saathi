'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { useToast } from '@/context/ToastContext';
import { Library, Plus, Trash2, Save, BookOpen, Layers, CheckCircle2 } from 'lucide-react';

export default function ManageCurriculumPage() {
  const { showSuccess, showError } = useToast();
  const [curriculum, setCurriculum] = useState<Record<string, Record<string, string[]>>>({});
  const [selectedStream, setSelectedStream] = useState('cse');
  const [selectedSemester, setSelectedSemester] = useState('1');
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.filters
      .getFilters()
      .then((data) => {
        if (data && data.curriculum) {
          setCurriculum(data.curriculum);
          const streams = Object.keys(data.curriculum);
          if (streams.length > 0) setSelectedStream(streams[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const currentSubjects = curriculum[selectedStream]?.[selectedSemester] || [];

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectInput.trim()) return;

    const trimmed = newSubjectInput.trim();
    setCurriculum((prev) => {
      const streamData = prev[selectedStream] || {};
      const semSubjects = streamData[selectedSemester] || [];
      if (semSubjects.includes(trimmed)) return prev;

      return {
        ...prev,
        [selectedStream]: {
          ...streamData,
          [selectedSemester]: [...semSubjects, trimmed],
        },
      };
    });

    setNewSubjectInput('');
  };

  const handleRemoveSubject = (subjectName: string) => {
    setCurriculum((prev) => {
      const streamData = prev[selectedStream] || {};
      const semSubjects = streamData[selectedSemester] || [];
      return {
        ...prev,
        [selectedStream]: {
          ...streamData,
          [selectedSemester]: semSubjects.filter((s) => s !== subjectName),
        },
      };
    });
  };

  const handleSaveCurriculum = async () => {
    setSaving(true);
    try {
      await api.filters.saveCurriculum({
        stream: selectedStream,
        semester: selectedSemester,
        subjects: currentSubjects.map((s) => ({ name: s })),
      });
      showSuccess(`Curriculum saved for ${selectedStream.toUpperCase()} Semester ${selectedSemester}`);
    } catch (err: any) {
      showError(err.message || 'Failed to save curriculum');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Curriculum & Syllabus Structure</h1>
          <p className="text-xs text-slate-400 mt-1">
            Define streams, semesters, and course subjects to guide document tagging and Socratic RAG routing.
          </p>
        </div>

        <button
          onClick={handleSaveCurriculum}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Syllabus Changes'}</span>
        </button>
      </div>

      {/* Stream and Semester Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Stream</label>
          <div className="flex flex-wrap gap-2">
            {['cse', 'it', 'ece', 'ee', 'me'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStream(st)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                  selectedStream === st
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Semester</label>
          <div className="flex flex-wrap gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8'].map((sem) => (
              <button
                key={sem}
                onClick={() => setSelectedSemester(sem)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  selectedSemester === sem
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Sem {sem}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subject List & Quick Add */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white uppercase tracking-wider">
            {selectedStream} • Semester {selectedSemester} Subjects ({currentSubjects.length})
          </h3>
        </div>

        {/* Add Subject Input */}
        <form onSubmit={handleAddSubject} className="flex gap-2">
          <input
            type="text"
            value={newSubjectInput}
            onChange={(e) => setNewSubjectInput(e.target.value)}
            placeholder="Add new course subject (e.g. Distributed Cloud Systems)..."
            className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
          />
          <button
            type="submit"
            disabled={!newSubjectInput.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            <span>Add Subject</span>
          </button>
        </form>

        {/* Subjects List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentSubjects.map((subject, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs"
            >
              <div className="flex items-center gap-2.5 truncate">
                <BookOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-white truncate">{subject}</span>
              </div>
              <button
                onClick={() => handleRemoveSubject(subject)}
                className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                title="Remove Subject"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
