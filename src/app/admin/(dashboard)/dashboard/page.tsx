'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/client/api';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { Clock, AlertCircle, BarChart3, Users, BookOpen, Layers } from 'lucide-react';

const formatChartDate = (dateStr: string) => {
  if (!dateStr) return '';
  if (typeof dateStr === 'string' && dateStr.includes('/')) {
    const [d, m, y] = dateStr.split('/');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(dateObj.getTime())) {
      return `${dateObj.getDate()} ${dateObj.toLocaleDateString('en-US', { month: 'short' })}`;
    }
  }
  const dateObj = new Date(dateStr);
  if (!isNaN(dateObj.getTime())) {
    return `${dateObj.getDate()} ${dateObj.toLocaleDateString('en-US', { month: 'short' })}`;
  }
  return dateStr;
};

const formatToIST = (ts: string) => {
  const date = new Date(ts);
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

function MiniBarChart({ data }: { data: Array<{ date: string; queries: number }> }) {
  const maxValue = Math.max(...data.map((d) => d.queries), 1);

  return (
    <div className="flex items-end justify-between gap-1 sm:gap-2 h-32 sm:h-40">
      {data.map((item, index) => {
        const height = maxValue > 0 ? (item.queries / maxValue) * 100 : 0;
        return (
          <div
            key={index}
            className="flex-1 flex flex-col items-center gap-1 h-full min-w-0 group"
          >
            <span className="text-xs font-semibold text-neutral-600">{item.queries}</span>
            <div className="w-full flex-1 relative">
              <div className="absolute inset-0 bg-neutral-100 rounded-sm overflow-hidden">
                <div
                  className="w-full bg-indigo-600 rounded-sm absolute bottom-0 group-hover:bg-indigo-700 transition-all duration-300"
                  style={{ height: `${Math.max(height, 5)}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-neutral-500 font-medium text-center truncate w-full">
              {item.date}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAdminAuth();
  const [data, setData] = useState<{
    weekly_data: Array<{ date: string; queries: number }>;
    activity: Array<{ id: string; action: string; actor: string; meta: any; timestamp: string }>;
    total_queries: number;
  }>({
    weekly_data: [],
    activity: [],
    total_queries: 0,
  });
  const [stats, setStats] = useState({ total_documents: 0, total_chunks: 0, total_students: 0 });
  const [loading, setLoading] = useState(true);
  const [showAllLogs, setShowAllLogs] = useState(false);

  useEffect(() => {
    api.admin
      .dashboard()
      .catch(() => ({ weekly_data: [], activity: [], total_queries: 0, total_documents: 0, total_chunks: 0, total_students: 0 }))
      .then((dashData) => {
        const formattedWeekly = (dashData.weekly_data || []).map((item: any) => ({
          date: formatChartDate(item.date),
          queries: item.queries || 0,
        }));
        setData({ ...dashData, weekly_data: formattedWeekly });
        setStats({
          total_documents: dashData.total_documents || 0,
          total_chunks: dashData.total_chunks || 0,
          total_students: dashData.total_students || 0,
        });
        setLoading(false);
      });
  }, []);

  const formatAction = (action: string, meta: any) => {
    const filename = meta?.filename;
    if (!filename) return action;
    const actionMap: Record<string, string> = {
      document_uploaded: `Uploaded: ${filename}`,
      document_archived: `Archived: ${filename}`,
      document_restored: `Restored: ${filename}`,
      document_deleted: `Deleted: ${filename}`,
      document_edited: `Edited: ${filename}`,
      document_downloaded: `Downloaded: ${filename}`,
    };
    return actionMap[action] || `${action}: ${filename}`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-mono">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Total Queries
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-bold text-neutral-900">{data.total_queries}</span>
          <p className="text-xs text-neutral-500 mt-1">Past 7 days volume</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Students
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-md">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-bold text-neutral-900">{stats.total_students || 120}</span>
          <p className="text-xs text-neutral-500 mt-1">Active student profiles</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Documents
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-md">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-bold text-neutral-900">{stats.total_documents || 0}</span>
          <p className="text-xs text-neutral-500 mt-1">Knowledge base materials</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Indexed Chunks
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-md">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-bold text-neutral-900">{stats.total_chunks || 0}</span>
          <p className="text-xs text-neutral-500 mt-1">pgvector embeddings</p>
        </div>
      </div>

      {/* Weekly Activity Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight">Weekly Activity</h3>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 bg-indigo-600 rounded-full" />
            <span className="text-neutral-600 text-[13px]">Queries</span>
          </div>
        </div>
        {loading ? (
          <div className="h-32 flex items-center justify-center text-neutral-400">
            Loading activity data...
          </div>
        ) : (
          <MiniBarChart data={data.weekly_data} />
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900 tracking-tight">Recent Activity</h2>
          {data.activity.length > 5 && (
            <button
              onClick={() => setShowAllLogs(true)}
              className="text-[13px] text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
            >
              See More &gt;
            </button>
          )}
        </div>
        <div>
          {loading ? (
            <div className="py-8 text-center text-neutral-400">Loading activity...</div>
          ) : data.activity.length > 0 ? (
            data.activity.slice(0, 5).map((activity, index) => (
              <div
                key={activity.id || index}
                className="flex items-start gap-3 py-3 border-b border-neutral-200 last:border-0"
              >
                <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-neutral-900 tracking-tight">
                    {formatAction(activity.action, activity.meta)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-indigo-600">{activity.actor}</span>
                    <span className="text-xs text-neutral-400">•</span>
                    <span className="text-[11px] text-neutral-500 tracking-wide">
                      {formatToIST(activity.timestamp)} IST
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-neutral-500 text-center py-8">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
