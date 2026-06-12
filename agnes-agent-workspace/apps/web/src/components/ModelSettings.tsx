import { useEffect, useMemo, useState } from 'react';
import { useModels } from '../hooks/useModels';
import type { ModelCapability, ModelCatalogEntry, ModelConfigInput } from '../types/agent';

const PROVIDER_BASE_URL: Record<ModelConfigInput['provider'], string> = {
  mock: '',
  agnes: 'https://apihub.agnes-ai.com/v1',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zenmux: 'https://zenmux.ai/api/vertex-ai',
  custom: '',
};

const DEFAULT_MODEL: Record<ModelConfigInput['provider'], string> = {
  mock: 'mock',
  agnes: 'agnes-2.0-flash',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  zenmux: 'google/gemini-3.1-flash-image',
  custom: '',
};

const CAPABILITY_LABEL: Record<ModelCapability, string> = {
  chat: '对话',
  image: '生图',
  video: '视频',
};

function groupByCapability(items: ModelCatalogEntry[]) {
  return {
    chat: items.filter((i) => i.capability === 'chat'),
    image: items.filter((i) => i.capability === 'image'),
    video: items.filter((i) => i.capability === 'video'),
  };
}

interface ModelSettingsProps {
  placement?: 'header' | 'input';
  /** Lock switching while an agent task is running */
  locked?: boolean;
}

export default function ModelSettings({ placement = 'header', locked = false }: ModelSettingsProps) {
  const { models, catalog, catalogLoading, saving, testing, error, save, test, reset, selectPreset, loadCatalog } =
    useModels();
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState<ModelConfigInput>({
    provider: 'mock',
    model: 'mock',
    baseUrl: '',
    apiKey: '',
    temperature: 0.2,
  });
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const grouped = useMemo(() => groupByCapability(catalog), [catalog]);
  const selectableChat = useMemo(
    () => grouped.chat.filter((p) => p.status === 'ok'),
    [grouped.chat],
  );
  const mediaOk = useMemo(
    () => [...grouped.image, ...grouped.video].filter((p) => p.status === 'ok'),
    [grouped.image, grouped.video],
  );

  useEffect(() => {
    if (!models) return;
    const provider = (models.provider === 'mock' ||
      models.provider === 'agnes' ||
      models.provider === 'openai' ||
      models.provider === 'deepseek' ||
      models.provider === 'zenmux' ||
      models.provider === 'custom'
      ? models.provider
      : 'mock') as ModelConfigInput['provider'];
    setForm((prev) => ({
      provider,
      model: models.model || DEFAULT_MODEL[provider],
      baseUrl: models.baseUrl || PROVIDER_BASE_URL[provider],
      apiKey: prev.apiKey,
      temperature: models.temperature ?? 0.2,
      presetId: models.presetId,
    }));
  }, [models]);

  const updateProvider = (provider: ModelConfigInput['provider']) => {
    setForm((prev) => ({
      ...prev,
      provider,
      model: DEFAULT_MODEL[provider],
      baseUrl: PROVIDER_BASE_URL[provider],
      apiKey: provider === 'mock' ? '' : prev.apiKey,
      presetId: undefined,
    }));
  };

  const handleSelectPreset = async (presetId: string) => {
    const saved = await selectPreset(presetId);
    if (saved) {
      setSavedMessage(`已切换至 ${saved.label ?? saved.model}`);
      window.setTimeout(() => setSavedMessage(null), 1800);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await save(form);
    if (saved) {
      setSavedMessage('已切换模型配置');
      setForm((prev) => ({ ...prev, apiKey: '' }));
      window.setTimeout(() => setSavedMessage(null), 1800);
    }
  };

  const handleTest = async () => {
    const result = await test(form);
    if (!result) return;
    const detail = result.sample ? ` · ${result.sample}` : '';
    setTestMessage(
      `${result.ok ? '✓' : '✗'} ${result.message} (${result.latencyMs}ms)${detail}`,
    );
    window.setTimeout(() => setTestMessage(null), 4000);
  };

  const handleReset = async () => {
    const restored = await reset();
    if (restored) {
      setSavedMessage('已恢复环境变量配置');
      void loadCatalog(true);
      window.setTimeout(() => setSavedMessage(null), 1800);
    }
  };

  const displayLabel = models?.label ?? models?.model ?? 'mock';

  const triggerClass =
    placement === 'input'
      ? 'max-w-[260px] truncate rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-200 transition hover:border-indigo-400/60 hover:bg-indigo-500/20 sm:max-w-[360px]'
      : 'rounded-lg border border-[var(--agnes-border-subtle)] px-2.5 py-1.5 text-[10px] text-slate-400 transition hover:border-indigo-500/40 hover:text-slate-200';

  const panelClass =
    placement === 'input'
      ? 'absolute bottom-full left-0 z-30 mb-2 w-[min(400px,calc(100vw-32px))] rounded-2xl border border-[var(--agnes-border-subtle)] bg-[var(--agnes-panel)] p-4 text-xs shadow-2xl shadow-black/40'
      : 'absolute right-0 z-30 mt-2 w-[400px] rounded-2xl border border-[var(--agnes-border-subtle)] bg-[var(--agnes-panel)] p-4 text-xs shadow-2xl shadow-black/40';

  const renderPresetButton = (preset: ModelCatalogEntry, selectable: boolean) => {
    const active = models?.presetId === preset.id;
    const statusIcon = preset.status === 'ok' ? '✓' : preset.status === 'error' ? '✗' : '·';
    return (
      <button
        key={preset.id}
        type="button"
        disabled={locked || saving || !selectable}
        onClick={() => void handleSelectPreset(preset.id)}
        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
          active
            ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-100'
            : selectable
              ? 'border-[var(--agnes-border-subtle)] text-slate-300 hover:border-indigo-500/40 hover:bg-white/[0.03]'
              : 'border-[var(--agnes-border-subtle)] text-slate-600 opacity-60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{preset.label}</span>
          <span className={preset.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
            {statusIcon}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-500">{preset.description}</p>
        {preset.statusMessage && (
          <p className="mt-1 text-[10px] text-slate-600">{preset.statusMessage}</p>
        )}
      </button>
    );
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => !locked && setOpen((v) => !v)}
        disabled={locked}
        title={locked ? '任务执行中，完成后可切换模型' : undefined}
        className={`${triggerClass} ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        模型：{displayLabel}
      </button>

      {open && (
        <div className={panelClass}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-slate-100">模型配置</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                当前：{displayLabel}
                {models?.source === 'runtime' ? ' · 本次会话配置' : ' · 环境变量'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"
            >
              隐藏
            </button>
          </div>

          {locked && (
            <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              任务执行中，当前运行已锁定启动时的模型配置；完成后可切换。
            </p>
          )}

          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">可用模型（已测试连通）</span>
              <button
                type="button"
                disabled={catalogLoading}
                onClick={() => void loadCatalog(true)}
                className="text-[10px] text-indigo-300 hover:text-indigo-200 disabled:opacity-50"
              >
                {catalogLoading ? '测试中…' : '重新测试'}
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-600">
                {CAPABILITY_LABEL.chat}
              </p>
              {selectableChat.length > 0 ? (
                selectableChat.map((p) => renderPresetButton(p, true))
              ) : (
                <p className="text-[11px] text-slate-600">暂无可用对话模型，请检查 .env 中的 API Key</p>
              )}
            </div>

            {mediaOk.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] uppercase tracking-wide text-slate-600">媒体生成</p>
                {mediaOk.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-[var(--agnes-border-subtle)] px-3 py-2 text-slate-400"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-300">{p.label}</span>
                      <span className="text-emerald-400">✓</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {CAPABILITY_LABEL[p.capability]} · 通过 /api/media 调用
                    </p>
                    {p.statusMessage && (
                      <p className="mt-1 text-[10px] text-slate-600">{p.statusMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {catalog.filter((p) => p.configured && p.status === 'error').length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] uppercase tracking-wide text-slate-600">不可用</p>
                {catalog
                  .filter((p) => p.configured && p.status === 'error')
                  .map((p) => renderPresetButton(p, false))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="mb-3 text-[11px] text-slate-500 hover:text-slate-300"
          >
            {showAdvanced ? '隐藏高级配置' : '高级配置（手动 Provider）'}
          </button>

          {showAdvanced && (
            <form onSubmit={handleSave} className="space-y-3 border-t border-[var(--agnes-border-subtle)] pt-3">
              <label className="block">
                <span className="mb-1 block text-slate-500">Provider</span>
                <select
                  value={form.provider}
                  onChange={(e) => updateProvider(e.target.value as ModelConfigInput['provider'])}
                  className="w-full rounded-lg border border-[var(--agnes-border-subtle)] bg-black/20 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500/50"
                >
                  <option value="mock">Mock 演示模式</option>
                  <option value="agnes">Agnes API</option>
                  <option value="openai">OpenAI Compatible</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="zenmux">ZenMux Vertex</option>
                  <option value="custom">自定义 OpenAI 兼容接口</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-slate-500">模型名称</span>
                <input
                  value={form.model}
                  onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="例如 gpt-4o-mini / deepseek-chat"
                  className="w-full rounded-lg border border-[var(--agnes-border-subtle)] bg-black/20 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500/50"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-slate-500">Base URL</span>
                <input
                  value={form.baseUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  disabled={form.provider === 'mock'}
                  placeholder="https://.../v1"
                  className="w-full rounded-lg border border-[var(--agnes-border-subtle)] bg-black/20 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-slate-500">API Key</span>
                <input
                  value={form.apiKey ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  disabled={form.provider === 'mock'}
                  type="password"
                  placeholder="仅发送到后端运行时内存"
                  className="w-full rounded-lg border border-[var(--agnes-border-subtle)] bg-black/20 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-slate-500">温度：{form.temperature.toFixed(1)}</span>
                <input
                  value={form.temperature}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, temperature: Number(e.target.value) }))
                  }
                  min={0}
                  max={2}
                  step={0.1}
                  type="range"
                  className="w-full accent-indigo-500"
                />
              </label>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                disabled={locked || saving || testing}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving ? '保存中' : '应用配置'}
                </button>
                <button
                  type="button"
                  disabled={saving || testing}
                  onClick={() => void handleTest()}
                  className="rounded-lg border border-indigo-500/40 px-3 py-2 text-indigo-200 transition hover:bg-indigo-500/10 disabled:opacity-50"
                >
                  {testing ? '测试中' : '测试连接'}
                </button>
                <button
                  type="button"
                  disabled={saving || testing}
                  onClick={() => void handleReset()}
                  className="rounded-lg border border-[var(--agnes-border-subtle)] px-3 py-2 text-slate-400 transition hover:text-slate-200 disabled:opacity-50"
                >
                  恢复 .env
                </button>
              </div>
            </form>
          )}

          {(error || savedMessage || testMessage) && (
            <p
              className={
                error
                  ? 'mt-3 text-red-300'
                  : testMessage?.startsWith('✗')
                    ? 'mt-3 text-amber-300'
                    : 'mt-3 text-emerald-300'
              }
            >
              {error ?? testMessage ?? savedMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
