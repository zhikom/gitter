export interface PanelLayoutValues {
  sidebarOpen: boolean;
  sidebarWidth: number;
  stagingOpen: boolean;
  rightPanelWidth: number;
  stagingListWidth: number;
  agentRailOpen: boolean;
  assistantOpen: boolean;
  laneMode: boolean;
}

export interface PanelLayout { id: string; name: string; values: PanelLayoutValues }

export function normalizeLayouts(value: unknown): PanelLayout[] | undefined {
  if (!Array.isArray(value) || value.length > 30) return undefined;
  const ids = new Set<string>();
  const result: PanelLayout[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined;
    const { id, name, values } = item;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id) || ids.has(id) || typeof name !== 'string' || !name.trim() || name.length > 60 || /[\x00-\x1f\x7f]/.test(name) || !values || typeof values !== 'object') return undefined;
    const { sidebarOpen, sidebarWidth, stagingOpen, rightPanelWidth, stagingListWidth, agentRailOpen, assistantOpen, laneMode } = values;
    if ([sidebarOpen, stagingOpen, agentRailOpen, assistantOpen, laneMode].some((entry) => typeof entry !== 'boolean') ||
        typeof sidebarWidth !== 'number' || !Number.isFinite(sidebarWidth) || sidebarWidth < 120 || sidebarWidth > 800 ||
        typeof rightPanelWidth !== 'number' || !Number.isFinite(rightPanelWidth) || rightPanelWidth < 240 || rightPanelWidth > 2000 ||
        typeof stagingListWidth !== 'number' || !Number.isFinite(stagingListWidth) || stagingListWidth < 120 || stagingListWidth > 1200) return undefined;
    ids.add(id);
    result.push({ id, name: name.trim(), values: { sidebarOpen, sidebarWidth, stagingOpen, rightPanelWidth, stagingListWidth, agentRailOpen, assistantOpen, laneMode } });
  }
  return result;
}
