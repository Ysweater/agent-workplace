import { useEffect, useState } from 'react';
import type {
  ModelCatalogEntry,
  ModelCatalogResponse,
  ModelConfigInput,
  ModelInfo,
  ModelTestResult,
} from '../types/agent';

const fallbackModel: ModelInfo = { provider: 'mock', model: 'mock', configured: false };

export function useModels(sessionId?: string | null) {
  const [models, setModels] = useState<ModelInfo | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      const response = await fetch(`/api/models${suffix}`);
      if (!response.ok) throw new Error('模型配置读取失败');
      const data = (await response.json()) as ModelInfo;
      setModels(data);
      setError(null);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '模型配置读取失败';
      setModels(fallbackModel);
      setError(message);
      return fallbackModel;
    }
  };

  const withSession = (config: ModelConfigInput) => ({
    ...config,
    ...(sessionId ? { sessionId } : {}),
  });

  const save = async (config: ModelConfigInput) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withSession(config)),
      });
      const raw = (await response.json()) as ModelInfo | { error?: string };
      const apiError = 'error' in raw ? raw.error : undefined;
      if (!response.ok || apiError) {
        throw new Error(apiError ?? '模型配置保存失败');
      }
      const data = raw as ModelInfo;
      setModels(data);
      window.dispatchEvent(new Event('agnes:model-updated'));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '模型配置保存失败';
      setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const test = async (config?: ModelConfigInput): Promise<ModelTestResult | null> => {
    setTesting(true);
    setError(null);
    try {
      const response = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config ?? {}),
      });
      const data = (await response.json()) as ModelTestResult & { error?: string };
      if (!response.ok && !data.message) {
        throw new Error(data.error ?? '模型连接测试失败');
      }
      if (data.ok) {
        await refresh();
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '模型连接测试失败';
      setError(message);
      return null;
    } finally {
      setTesting(false);
    }
  };

  const loadCatalog = async (test = true) => {
    setCatalogLoading(true);
    try {
      const response = await fetch(`/api/models/catalog?test=${test ? '1' : '0'}`);
      if (!response.ok) throw new Error('模型目录加载失败');
      const data = (await response.json()) as ModelCatalogResponse;
      setCatalog(data.items);
      if (!sessionId && data.active) setModels(data.active);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '模型目录加载失败';
      setError(message);
      return null;
    } finally {
      setCatalogLoading(false);
    }
  };

  const selectPreset = async (presetId: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId, ...(sessionId ? { sessionId } : {}) }),
      });
      const raw = (await response.json()) as ModelInfo | { error?: string };
      const apiError = 'error' in raw ? raw.error : undefined;
      if (!response.ok || apiError) {
        throw new Error(apiError ?? '切换模型失败');
      }
      const data = raw as ModelInfo;
      setModels(data);
      window.dispatchEvent(new Event('agnes:model-updated'));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '切换模型失败';
      setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    setError(null);
    try {
      const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      const response = await fetch(`/api/models${suffix}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('恢复环境配置失败');
      const data = (await response.json()) as ModelInfo;
      setModels(data);
      window.dispatchEvent(new Event('agnes:model-updated'));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '恢复环境配置失败';
      setError(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void refresh();
    void loadCatalog(true);
    const onModelUpdated = () => {
      void refresh();
      void loadCatalog(false);
    };
    window.addEventListener('agnes:model-updated', onModelUpdated);
    return () => window.removeEventListener('agnes:model-updated', onModelUpdated);
  }, [sessionId]);

  return {
    models,
    catalog,
    catalogLoading,
    saving,
    testing,
    error,
    refresh,
    loadCatalog,
    selectPreset,
    save,
    test,
    reset,
  };
}
