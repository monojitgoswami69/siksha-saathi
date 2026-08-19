'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import { Library, Plus, Trash2, Save, BookOpen, Layers } from 'lucide-react';

interface CurrRow {
  stream: string;
  semester: string;
  subjects: any[];
  sections: any[];
}

export default function ManageCurriculumPage() {
  const { showSuccess, showError } = useToast();
  const [rows, setRows] = useState<CurrRow[]>([]);
  const [selectedStream, setSelectedStream] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newStream, setNewStream] = useState('');
  const [newSemester, setNewSemester] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/curriculum', { method: 'GET' });
      const data = await res.json();
      const curr: CurrRow[] = data.curriculum || [];
      setRows(curr);
      if (curr.length) {
        setSelectedStream((p) => p || curr[0].stream);
        setSelectedSemester((p) => p || curr[0].semester);
      }
    } catch {
      showError('Failed to load curriculum');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    load();
  }, [load]);

  const streams = Array.from(new Set(rows.map((r) => r.stream)));
  const semestersForStream = Array.from(
    new Set(rows.filter((r) => r.stream === selectedStream).map((r) => r.semester))
  );

  const current = rows.find((r) => r.stream === selectedStream && r.semester === selectedSemester);
  const subjects: string[] = (current?.subjects || []).map((s: any) =>
    typeof s === 'string' ? s : s.name || s.title || ''
  );
  const sections: string[] = (current?.sections || []).map((s: any) =>
    typeof s === 'string' ? s : s.name || s.title || s.section || ''
  );

  const upsertRow = (stream: string, semester: string, patch: Partial<CurrRow>) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.stream === stream && r.semester === semester);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...patch };
        return copy;
      }
      return [
        ...prev,
        { stream, semester, subjects: patch.subjects || [], sections: patch.sections || [] },
      ];
    });
  };

  const addSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !selectedStream || !selectedSemester) return;
    const t = newSubject.trim();
    if (subjects.includes(t)) return;
    upsertRow(selectedStream, selectedSemester, { subjects: [...subjects, t] });
    setNewSubject('');
  };

  const removeSubject = (s: string) =>
    upsertRow(selectedStream, selectedSemester, { subjects: subjects.filter((x) => x !== s) });

  const addSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSection.trim() || !selectedStream || !selectedSemester) return;
    const t = newSection.trim().toLowerCase();
    if (sections.includes(t)) return;
    upsertRow(selectedStream, selectedSemester, { sections: [...sections, t] });
    setNewSection('');
  };

  const removeSection = (s: string) =>
    upsertRow(selectedStream, selectedSemester, { sections: sections.filter((x) => x !== s) });

  const addStream = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newStream.trim().toLowerCase();
    if (!t) return;
    // create a starter semester row if none exists
    if (!rows.some((r) => r.stream === t)) {
      setRows((prev) => [...prev, { stream: t, semester: '1', subjects: [], sections: [] }]);
    }
    setSelectedStream(t);
    setSelectedSemester('1');
    setNewStream('');
  };

  const addSemester = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newSemester.trim();
    if (!t || !selectedStream) return;
    if (!rows.some((r) => r.stream === selectedStream && r.semester === t)) {
      setRows((prev) => [...prev, { stream: selectedStream, semester: t, subjects: [], sections: [] }]);
    }
    setSelectedSemester(t);
    setNewSemester('');
  };

  const save = async () => {
    if (!selectedStream || !selectedSemester) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/curriculum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: selectedStream,
          semester: selectedSemester,
          subjects: subjects.map((s) => ({ name: s })),
          sections: sections.map((s) => ({ name: s })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Save failed');
      showSuccess(
        `Saved ${selectedStream.toUpperCase()} Sem ${selectedSemester}` +
          (data.pruned_documents ? ` • pruned ${data.pruned_documents} doc(s)` : '')
      );
      // reload to reflect server-pruned state
      load();
    } catch (err: any) {
      showError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-mono">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Curriculum & Syllabus Structure</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Add streams, semesters, sections-per-semester & subjects. Removing a subject auto-deletes its tied materials.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || !selectedStream || !selectedSemester}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-40 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      {/* Stream selector + add new stream */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 space-y-3 shadow-sm">
        <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider">Stream (Course)</label>
        <div className="flex flex-wrap gap-2">
          {streams.length === 0 && <span className="text-xs text-neutral-400">No streams yet — add one below.</span>}
          {streams.map((st) => (
            <button
              key={st}
              onClick={() => {
                setSelectedStream(st);
                setSelectedSemester(semestersForStream[0] || '1');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase transition-all ${
                selectedStream === st
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <form onSubmit={addStream} className="flex gap-2">
          <input
            type="text"
            value={newStream}
            onChange={(e) => setNewStream(e.target.value)}
            placeholder="Add new stream (e.g. aiml)..."
            className="flex-1 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          <button type="submit" disabled={!newStream.trim()} className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-40">
            <Plus className="w-4 h-4" /> Add Stream
          </button>
        </form>
      </div>

      {/* Semester selector + add new semester */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 space-y-3 shadow-sm">
        <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider">Semester</label>
        <div className="flex flex-wrap gap-2">
          {semestersForStream.map((sem) => (
            <button
              key={sem}
              onClick={() => setSelectedSemester(sem)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                selectedSemester === sem
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
              }`}
            >
              Sem {sem}
            </button>
          ))}
          {semestersForStream.length === 0 && selectedStream && (
            <span className="text-xs text-neutral-400">No semesters for {selectedStream.toUpperCase()} yet.</span>
          )}
        </div>
        {selectedStream && (
          <form onSubmit={addSemester} className="flex gap-2">
            <input
              type="text"
              value={newSemester}
              onChange={(e) => setNewSemester(e.target.value)}
              placeholder={`Add semester for ${selectedStream.toUpperCase()} (e.g. 5)...`}
              className="flex-1 px-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
            <button type="submit" disabled={!newSemester.trim()} className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-40">
              <Plus className="w-4 h-4" /> Add Sem
            </button>
          </form>
        )}
      </div>

      {/* Subjects + Sections for the selected stream/sem */}
      {selectedStream && selectedSemester ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Subjects */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" /> Subjects ({subjects.length})
            </h3>
            <form onSubmit={addSubject} className="flex gap-2">
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Add subject..."
                className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
              <button type="submit" disabled={!newSubject.trim()} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-40">
                <Plus className="w-4 h-4" />
              </button>
            </form>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {subjects.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs">
                  <span className="font-semibold text-neutral-900 truncate">{s}</span>
                  <button onClick={() => removeSubject(s)} className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Remove (deletes tied materials on save)">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {subjects.length === 0 && <p className="text-[11px] text-neutral-400">No subjects yet.</p>}
            </div>
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg">⚠ Removing a subject deletes documents tied to it (on save).</p>
          </div>

          {/* Sections (batches) */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 md:p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" /> Sections / Batches ({sections.length})
            </h3>
            <form onSubmit={addSection} className="flex gap-2">
              <input
                type="text"
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                placeholder="Add section (e.g. cse1)..."
                className="flex-1 px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
              />
              <button type="submit" disabled={!newSection.trim()} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-40">
                <Plus className="w-4 h-4" />
              </button>
            </form>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {sections.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs">
                  <span className="font-semibold text-neutral-900 uppercase truncate">{s}</span>
                  <button onClick={() => removeSection(s)} className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Remove section">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {sections.length === 0 && <p className="text-[11px] text-neutral-400">No sections defined (students/documents can still use any section text).</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center shadow-sm">
          <Library className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Add a stream and semester to begin defining subjects & sections.</p>
        </div>
      )}
    </div>
  );
}
