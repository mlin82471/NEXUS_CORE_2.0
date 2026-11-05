import React, { useState, useEffect } from 'react';
import { TaskExperience } from '../types.ts';

const API_BASE = 'http://127.0.0.1:8000';

export const MemoryInspector: React.FC = () => {
  const [query, setQuery] = useState('');
  const [experiences, setExperiences] = useState<TaskExperience[]>([]);
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchExperiences = async () => {
    try {
      const res = await fetch(`${API_BASE}/memory/experiences`);
      if (res.ok) setExperiences(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchExperiences();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/memory/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: query.trim(), task_type: 'general' })
      });
      if (res.ok) setSearchResult(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: '18px', padding: '24px', border: '1px solid rgba(0,0,0,0.06)' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1d1d1f', marginBottom: '8px' }}>
        🧠 M3 长期记忆与持续学习知识库
      </h2>
      <p style={{ fontSize: '13px', color: '#86868b', marginBottom: '20px' }}>
        沉淀历史任务成功图谱、深度 RCA 失败归因与避坑经验，在新任务规划前智能注入增强。
      </p>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="输入目标进行历史经验与避坑建议检索 (例如：快速排序、高并发缓存、SQL慢查询)..."
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid #d2d2d7', fontSize: '13px' }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#0071e3', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
        >
          {loading ? '检索中...' : '🔍 检索相关记忆'}
        </button>
      </div>

      {searchResult && (
        <div style={{ background: '#f5f5f7', borderRadius: '12px', padding: '16px', marginBottom: '24px', border: '1px solid #e5e5ea' }}>
          <strong style={{ fontSize: '14px', color: '#1d1d1f' }}>🎯 检索召回结果:</strong>
          {searchResult.best_practice_hints?.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#34c759' }}>💡 历史成功经验 (Proven Patterns):</span>
              <ul style={{ margin: '6px 0 0 18px', fontSize: '13px', color: '#1d1d1f' }}>
                {searchResult.best_practice_hints.map((h: string, i: number) => <li key={i}>{h}</li>)}
              </ul>
            </div>
          )}
          {searchResult.failure_warnings?.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#ff3b30' }}>⚠️ 历史踩坑与失败预警 (Failure Prevention):</span>
              <ul style={{ margin: '6px 0 0 18px', fontSize: '13px', color: '#1d1d1f' }}>
                {searchResult.failure_warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Experience List */}
      <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1d1d1f', marginBottom: '12px' }}>
        📚 累计任务沉淀经验 ({experiences.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {experiences.map(e => (
          <div key={e.id} style={{ border: '1px solid #e5e5ea', borderRadius: '10px', padding: '12px', background: '#fafafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: '600', fontSize: '13px', color: '#1d1d1f' }}>{e.goal}</span>
              <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '6px', background: e.status === 'success' ? '#e3f9e5' : '#ffebe9', color: e.status === 'success' ? '#1a7f37' : '#cf222e' }}>
                {e.status}
              </span>
            </div>
            {e.lessons_learned && (
              <div style={{ fontSize: '12px', color: '#1a7f37', marginTop: '4px' }}>
                💡 沉淀经验: {e.lessons_learned}
              </div>
            )}
            {e.failure_reasons && e.failure_reasons.length > 0 && (
              <div style={{ fontSize: '12px', color: '#cf222e', marginTop: '4px' }}>
                ⚠️ 归因 RCA: {JSON.stringify(e.failure_reasons)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
