import type { ModelPreferenceRecord } from './storage/types.js';
import { storageService } from './storage.service.js';
import {
  buildPublicModelsInfoFromSnapshot,
  captureModelSnapshot,
  resolveModelSnapshotFromInput,
  type RuntimeModelConfigInput,
} from './modelProvider.service.js';

export type SessionModelPreferenceInput = RuntimeModelConfigInput & {
  label?: string;
};

export async function loadSessionModelPreference(
  sessionId?: string,
): Promise<ModelPreferenceRecord | null> {
  if (!sessionId?.trim()) return null;
  return storageService.loadModelPreference(sessionId.trim());
}

export async function saveSessionModelPreference(
  sessionId: string,
  input: SessionModelPreferenceInput,
): Promise<ModelPreferenceRecord> {
  const trimmed = sessionId.trim();
  if (!trimmed) {
    throw new Error('sessionId is required');
  }

  const snapshot = resolveModelSnapshotFromInput(input);
  const preference: ModelPreferenceRecord = {
    sessionId: trimmed,
    provider: snapshot.provider,
    model: snapshot.model,
    baseUrl: snapshot.baseUrl,
    temperature: snapshot.temperature,
    presetId: snapshot.presetId,
    label: snapshot.label ?? input.label,
    apiKey: snapshot.apiKey,
    updatedAt: new Date().toISOString(),
  };
  await storageService.saveModelPreference(trimmed, preference);
  return preference;
}

export async function deleteSessionModelPreference(sessionId: string): Promise<void> {
  await storageService.deleteModelPreference(sessionId);
}

export async function captureSessionModelSnapshot(sessionId?: string) {
  const preference = await loadSessionModelPreference(sessionId);
  if (!preference) {
    return captureModelSnapshot();
  }
  return resolveModelSnapshotFromInput({
    provider: preference.provider as RuntimeModelConfigInput['provider'],
    model: preference.model,
    baseUrl: preference.baseUrl,
    apiKey: preference.apiKey,
    temperature: preference.temperature,
    presetId: preference.presetId,
  });
}

export async function getSessionPublicModelInfo(sessionId?: string) {
  const snapshot = await captureSessionModelSnapshot(sessionId);
  return buildPublicModelsInfoFromSnapshot(snapshot);
}
