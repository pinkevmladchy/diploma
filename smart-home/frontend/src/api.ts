import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 10_000,
});

const ACCESS_KEY = 'sh.accessToken';
const REFRESH_KEY = 'sh.refreshToken';
// When an admin impersonates a customer we stash their original tokens under
// these keys so they can step back to their admin session without a re-login.
const IMP_ACCESS_KEY = 'sh.impersonator.accessToken';
const IMP_REFRESH_KEY = 'sh.impersonator.refreshToken';

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh?: string) => {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
  /** Move the current tokens into the impersonator backup slot. */
  stashAsImpersonator: () => {
    const a = localStorage.getItem(ACCESS_KEY);
    const r = localStorage.getItem(REFRESH_KEY);
    if (a) localStorage.setItem(IMP_ACCESS_KEY, a);
    if (r) localStorage.setItem(IMP_REFRESH_KEY, r);
  },
  /** Pull the impersonator tokens back into the active slot. */
  popImpersonator: (): { access: string; refresh: string } | null => {
    const a = localStorage.getItem(IMP_ACCESS_KEY);
    const r = localStorage.getItem(IMP_REFRESH_KEY);
    if (!a || !r) return null;
    localStorage.setItem(ACCESS_KEY, a);
    localStorage.setItem(REFRESH_KEY, r);
    localStorage.removeItem(IMP_ACCESS_KEY);
    localStorage.removeItem(IMP_REFRESH_KEY);
    return { access: a, refresh: r };
  },
  hasImpersonator: (): boolean => !!localStorage.getItem(IMP_ACCESS_KEY),
};

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

api.interceptors.request.use((config) => {
  const access = tokenStore.getAccess();
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  try {
    const res = await axios.post<{ accessToken: string }>('/api/auth/refresh', { refreshToken });
    tokenStore.set(res.data.accessToken);
    return res.data.accessToken;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      const url = original.url ?? '';
      if (!url.includes('/auth/refresh') && !url.includes('/auth/login')) {
        original._retry = true;
        refreshing ??= refreshAccessToken().finally(() => {
          refreshing = null;
        });
        const newAccess = await refreshing;
        if (newAccess) {
          original.headers.Authorization = `Bearer ${newAccess}`;
          return api.request(original);
        }
        tokenStore.clear();
        onUnauthorized?.();
      }
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'user';
  avatarUrl: string | null;
  themeBrand: string | null;
  themePrimary: string | null;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

export type DeviceType =
  | 'thermostat'
  | 'lamp'
  | 'motion_sensor'
  | 'power_meter'
  | 'air_quality'
  | 'water_leak'
  | 'smart_lock';

export type DeviceStatus = 'on' | 'off';

export type MetricType =
  | 'temperature'
  | 'humidity'
  | 'power'
  | 'motion'
  | 'co2'
  | 'light_level'
  | 'water_leak';

export type House = {
  id: number;
  name: string;
  address: string | null;
  roomCount: number;
  createdAt: string;
};

export type Room = {
  id: number;
  name: string;
  description: string | null;
  floorplanUrl: string | null;
  house: { id: number; name: string };
  deviceCount: number;
  createdAt: string;
};

export type Device = {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  isOnline: boolean;
  floorplanX: number | null;
  floorplanY: number | null;
  room: { id: number; name: string; house: { id: number; name: string } };
  latestTelemetry: {
    metricType: MetricType;
    value: number;
    unit: string;
    timestamp: string;
  } | null;
};

export type HouseDetail = {
  id: number;
  name: string;
  address: string | null;
  createdAt: string;
  roomCount: number;
  rooms: {
    id: number;
    name: string;
    description: string | null;
    deviceCount: number;
  }[];
};

export type RoomDetail = {
  id: number;
  name: string;
  description: string | null;
  floorplanUrl: string | null;
  createdAt: string;
  house: { id: number; name: string };
  devices: {
    id: string;
    name: string;
    type: DeviceType;
    status: DeviceStatus;
    isOnline: boolean;
    floorplanX: number | null;
    floorplanY: number | null;
    latestTelemetry: {
      metricType: MetricType;
      value: number;
      unit: string;
      timestamp: string;
    } | null;
  }[];
};

export type DeviceDetail = Device & { createdAt: string };

export type TelemetryPoint = {
  id: string;
  metricType: MetricType;
  value: number;
  unit: string;
  timestamp: string;
};

export type TelemetryLogEntry = {
  id: string;
  metricType: MetricType;
  value: number;
  unit: string;
  timestamp: string;
  device: {
    id: string;
    name: string;
    type: DeviceType;
    room: {
      id: number;
      name: string;
      house: { id: number; name: string };
    };
  };
};

export type AlertCondition = 'gt' | 'lt' | 'eq' | 'gte' | 'lte';

export type AlertRule = {
  id: number;
  house: { id: number; name: string };
  name: string | null;
  metricType: MetricType;
  condition: AlertCondition;
  thresholdValue: number;
  isActive: boolean;
  createdAt: string;
};

export type AlertEvent = {
  id: number;
  alertId: number;
  alertName: string | null;
  condition: AlertCondition;
  conditionSymbol: string;
  thresholdValue: number;
  metricType: MetricType;
  triggerValue: number;
  latestValue: number;
  unit: string;
  triggeredAt: string;
  lastSeenAt: string;
  clearedAt: string | null;
  clearReason: 'auto' | 'manual' | null;
  house: { id: number; name: string };
  room: { id: number; name: string };
  device: { id: string; name: string };
};

/** Backwards-compatible alias used by the Dashboard widget. */
export type ActiveAlert = AlertEvent;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/login', { email, password });
  return res.data;
}

export async function register(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/register', input);
  return res.data;
}

export async function fetchMe(): Promise<User> {
  const res = await api.get<User>('/auth/me');
  return res.data;
}

export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData();
  form.append('avatar', file);
  const res = await api.post<User>('/auth/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function removeAvatar(): Promise<User> {
  const res = await api.delete<User>('/auth/me/avatar');
  return res.data;
}

export async function updateThemePreference(input: {
  brand?: string | null;
  primary?: string | null;
}): Promise<User> {
  const res = await api.patch<User>('/auth/me/theme', input);
  return res.data;
}

// ---------------------------------------------------------------------------
// Houses
// ---------------------------------------------------------------------------

export async function fetchHouses(): Promise<House[]> {
  const res = await api.get<House[]>('/houses');
  return res.data;
}

export async function fetchHouse(id: number): Promise<HouseDetail> {
  const res = await api.get<HouseDetail>(`/houses/${id}`);
  return res.data;
}

export async function createHouse(input: {
  name: string;
  address?: string | null;
}): Promise<House> {
  const res = await api.post<House>('/houses', input);
  return res.data;
}

export async function updateHouse(
  id: number,
  input: { name?: string; address?: string | null },
): Promise<House> {
  const res = await api.patch<House>(`/houses/${id}`, input);
  return res.data;
}

export async function deleteHouse(id: number): Promise<void> {
  await api.delete(`/houses/${id}`);
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export async function fetchRooms(params?: { houseId?: number }): Promise<Room[]> {
  const res = await api.get<Room[]>('/rooms', { params });
  return res.data;
}

export async function fetchRoom(id: number): Promise<RoomDetail> {
  const res = await api.get<RoomDetail>(`/rooms/${id}`);
  return res.data;
}

export async function createRoom(input: {
  houseId: number;
  name: string;
  description?: string | null;
}): Promise<Room> {
  const res = await api.post<Room>('/rooms', input);
  return res.data;
}

export async function updateRoom(
  id: number,
  input: { name?: string; description?: string | null },
): Promise<Room> {
  const res = await api.patch<Room>(`/rooms/${id}`, input);
  return res.data;
}

export async function deleteRoom(id: number): Promise<void> {
  await api.delete(`/rooms/${id}`);
}

export async function uploadRoomFloorplan(
  id: number,
  file: File,
): Promise<{ floorplanUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post<{ floorplanUrl: string }>(`/rooms/${id}/floorplan`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteRoomFloorplan(id: number): Promise<void> {
  await api.delete(`/rooms/${id}/floorplan`);
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export async function fetchDevices(params?: {
  roomId?: number;
  houseId?: number;
}): Promise<Device[]> {
  const res = await api.get<Device[]>('/devices', { params });
  return res.data;
}

export async function fetchDevice(id: string): Promise<DeviceDetail> {
  const res = await api.get<DeviceDetail>(`/devices/${id}`);
  return res.data;
}

export async function fetchDeviceTelemetry(
  id: string,
  params: { limit?: number; from?: string; to?: string } = {},
): Promise<TelemetryPoint[]> {
  const res = await api.get<TelemetryPoint[]>(`/devices/${id}/telemetry`, {
    params: { limit: params.limit ?? 50, ...(params.from ? { from: params.from } : {}), ...(params.to ? { to: params.to } : {}) },
  });
  return res.data;
}

export async function fetchTelemetryLog(params?: {
  deviceId?: string;
  houseId?: number;
  roomId?: number;
  metricType?: MetricType;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<TelemetryLogEntry[]> {
  const res = await api.get<TelemetryLogEntry[]>('/telemetry', { params });
  return res.data;
}

export async function createDevice(input: {
  roomId: number;
  name: string;
  type: DeviceType;
  status?: DeviceStatus;
}): Promise<Device> {
  const res = await api.post<Device>('/devices', input);
  return res.data;
}

export async function updateDevice(
  id: string,
  input: {
    name?: string;
    type?: DeviceType;
    status?: DeviceStatus;
    isOnline?: boolean;
    floorplanX?: number | null;
    floorplanY?: number | null;
  },
): Promise<Device> {
  const res = await api.patch<Device>(`/devices/${id}`, input);
  return res.data;
}

export async function deleteDevice(id: string): Promise<void> {
  await api.delete(`/devices/${id}`);
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function fetchAlerts(params?: { houseId?: number }): Promise<AlertRule[]> {
  const res = await api.get<AlertRule[]>('/alerts', { params });
  return res.data;
}

export async function fetchActiveAlerts(): Promise<AlertEvent[]> {
  const res = await api.get<AlertEvent[]>('/alerts/active');
  return res.data;
}

export async function fetchAlertEvents(params?: {
  status?: 'active' | 'cleared' | 'all';
  houseId?: number;
  limit?: number;
}): Promise<AlertEvent[]> {
  const res = await api.get<AlertEvent[]>('/alerts/events', { params });
  return res.data;
}

export async function clearAlertEvent(id: number): Promise<AlertEvent> {
  const res = await api.post<AlertEvent>(`/alerts/events/${id}/clear`);
  return res.data;
}

export async function createAlert(input: {
  houseId: number;
  name?: string | null;
  metricType: MetricType;
  condition: AlertCondition;
  thresholdValue: number;
  isActive?: boolean;
}): Promise<AlertRule> {
  const res = await api.post<AlertRule>('/alerts', input);
  return res.data;
}

export async function updateAlert(
  id: number,
  input: Partial<{
    name: string | null;
    metricType: MetricType;
    condition: AlertCondition;
    thresholdValue: number;
    isActive: boolean;
  }>,
): Promise<AlertRule> {
  const res = await api.patch<AlertRule>(`/alerts/${id}`, input);
  return res.data;
}

export async function deleteAlert(id: number): Promise<void> {
  await api.delete(`/alerts/${id}`);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export type ScenarioTriggerType = 'time' | 'sensor' | 'manual';

export type ScenarioTrigger =
  | { kind: 'manual' }
  | { kind: 'time'; hour: number; minute: number }
  | {
      kind: 'sensor';
      deviceId: string;
      metricType: MetricType;
      condition: AlertCondition;
      threshold: number;
    };

export type ScenarioAction =
  | { kind: 'set_device_status'; deviceId: string; status: DeviceStatus }
  | { kind: 'notify'; message: string; type?: 'info' | 'warning' | 'alert' };

export type Scenario = {
  id: number;
  userId: string;
  name: string;
  triggerType: ScenarioTriggerType;
  triggerValue: ScenarioTrigger;
  actions: ScenarioAction[];
  isActive: boolean;
  createdAt: string;
};

export type ScenarioRunResult = {
  scenarioId: number;
  results: Array<{ action: ScenarioAction; ok: boolean; error?: string }>;
};

export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await api.get<Scenario[]>('/scenarios');
  return res.data;
}

export async function createScenario(input: {
  name: string;
  triggerType: ScenarioTriggerType;
  trigger: ScenarioTrigger;
  actions: ScenarioAction[];
  isActive?: boolean;
}): Promise<Scenario> {
  const res = await api.post<Scenario>('/scenarios', input);
  return res.data;
}

export async function updateScenario(
  id: number,
  input: Partial<{
    name: string;
    triggerType: ScenarioTriggerType;
    trigger: ScenarioTrigger;
    actions: ScenarioAction[];
    isActive: boolean;
  }>,
): Promise<Scenario> {
  const res = await api.patch<Scenario>(`/scenarios/${id}`, input);
  return res.data;
}

export async function deleteScenario(id: number): Promise<void> {
  await api.delete(`/scenarios/${id}`);
}

export async function runScenario(id: number): Promise<ScenarioRunResult> {
  const res = await api.post<ScenarioRunResult>(`/scenarios/${id}/run`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Admin (admin role only)
// ---------------------------------------------------------------------------

export type CustomerSummary = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
  houseCount: number;
  roomCount: number;
  deviceCount: number;
  scenarioCount: number;
  notificationCount: number;
};

export type CustomerDetail = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
  scenarioCount: number;
  notificationCount: number;
  houses: Array<{
    id: number;
    name: string;
    address: string | null;
    createdAt: string;
    roomCount: number;
    deviceCount: number;
    rooms: Array<{ id: number; name: string; deviceCount: number }>;
  }>;
};

export async function fetchCustomers(): Promise<CustomerSummary[]> {
  const res = await api.get<CustomerSummary[]>('/admin/customers');
  return res.data;
}

export async function fetchCustomer(id: string): Promise<CustomerDetail> {
  const res = await api.get<CustomerDetail>(`/admin/customers/${id}`);
  return res.data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/admin/customers/${id}`);
}

export type ImpersonateResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

export async function impersonateCustomer(id: string): Promise<ImpersonateResponse> {
  const res = await api.post<ImpersonateResponse>(`/admin/customers/${id}/impersonate`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Emulator
// ---------------------------------------------------------------------------

export type EmulatorStatus =
  | { running: false }
  | {
      running: true;
      intervalMs: number;
      startedAt: string;
      lastTickAt: string | null;
      lastInserted: number;
      deviceCount: number;
    };

export async function fetchEmulatorStatus(): Promise<EmulatorStatus> {
  const res = await api.get<EmulatorStatus>('/emulator/status');
  return res.data;
}

export async function startEmulator(intervalMs?: number): Promise<EmulatorStatus> {
  const res = await api.post<EmulatorStatus>('/emulator/start', { intervalMs });
  return res.data;
}

export async function stopEmulator(): Promise<EmulatorStatus> {
  const res = await api.post<EmulatorStatus>('/emulator/stop');
  return res.data;
}
