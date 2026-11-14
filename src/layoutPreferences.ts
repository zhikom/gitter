import type { PanelLayoutValues } from '../shared/types/layout';
import { defaultPreference, getPreference, setPreferencesBatch, type Preferences } from './preferences';

const keys: Array<keyof PanelLayoutValues> = ['sidebarOpen', 'sidebarWidth', 'stagingOpen', 'rightPanelWidth', 'stagingListWidth', 'agentRailOpen', 'assistantOpen', 'laneMode'];

export function capturePanelLayout(): PanelLayoutValues {
  return Object.fromEntries(keys.map((key) => [key, getPreference(key)])) as unknown as PanelLayoutValues;
}

export function defaultPanelLayout(): PanelLayoutValues {
  return Object.fromEntries(keys.map((key) => [key, defaultPreference(key)])) as unknown as PanelLayoutValues;
}

export function applyPanelLayout(values: PanelLayoutValues): void {
  setPreferencesBatch(keys.map((key): [keyof Preferences, Preferences[keyof Preferences]] => [key, values[key]]));
}
