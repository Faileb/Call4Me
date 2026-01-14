const BASE_URL = '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  }

  return response.json()
}

export const api = {
  auth: {
    session: () =>
      fetchJson<{
        authenticated: boolean
        authEnabled: boolean
        hasPassword: boolean
        isSetupMode: boolean
      }>(`${BASE_URL}/auth/session`),
    login: (password: string) =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    logout: () =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/auth/logout`, {
        method: 'POST',
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/auth/change-password`, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  },

  recordings: {
    list: () => fetchJson<Recording[]>(`${BASE_URL}/recordings`),
    get: (id: string) => fetchJson<Recording>(`${BASE_URL}/recordings/${id}`),
    upload: async (file: File, data: { name?: string; description?: string; tags?: string[] }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (data.name) formData.append('name', data.name)
      if (data.description) formData.append('description', data.description)
      if (data.tags) formData.append('tags', JSON.stringify(data.tags))

      const response = await fetch(`${BASE_URL}/recordings/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(error.error || 'Upload failed')
      }

      return response.json() as Promise<Recording>
    },
    saveRecording: async (blob: Blob, data: { name?: string; description?: string; duration: number }) => {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      if (data.name) formData.append('name', data.name)
      if (data.description) formData.append('description', data.description)
      formData.append('duration', data.duration.toString())

      const response = await fetch(`${BASE_URL}/recordings/record`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Save failed' }))
        throw new Error(error.error || 'Save failed')
      }

      return response.json() as Promise<Recording>
    },
    update: (id: string, data: Partial<Pick<Recording, 'name' | 'description' | 'tags'>>) =>
      fetchJson<Recording>(`${BASE_URL}/recordings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/recordings/${id}`, {
        method: 'DELETE',
      }),
    audioUrl: (id: string) => `${BASE_URL}/recordings/${id}/audio`,
  },

  contacts: {
    list: (search?: string) =>
      fetchJson<Contact[]>(`${BASE_URL}/contacts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id: string) => fetchJson<Contact>(`${BASE_URL}/contacts/${id}`),
    create: (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) =>
      fetchJson<Contact>(`${BASE_URL}/contacts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>>) =>
      fetchJson<Contact>(`${BASE_URL}/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/contacts/${id}`, {
        method: 'DELETE',
      }),
  },

  templates: {
    list: () => fetchJson<Template[]>(`${BASE_URL}/templates`),
    get: (id: string) => fetchJson<Template>(`${BASE_URL}/templates/${id}`),
    create: (data: CreateTemplateData) =>
      fetchJson<Template>(`${BASE_URL}/templates`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<CreateTemplateData>) =>
      fetchJson<Template>(`${BASE_URL}/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/templates/${id}`, {
        method: 'DELETE',
      }),
    clone: (id: string) =>
      fetchJson<Template>(`${BASE_URL}/templates/${id}/clone`, {
        method: 'POST',
      }),
  },

  calls: {
    scheduled: {
      list: () => fetchJson<ScheduledCall[]>(`${BASE_URL}/calls/scheduled`),
      get: (id: string) => fetchJson<ScheduledCall>(`${BASE_URL}/calls/scheduled/${id}`),
      create: (data: CreateScheduledCallData) =>
        fetchJson<ScheduledCall>(`${BASE_URL}/calls/scheduled`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Partial<CreateScheduledCallData>) =>
        fetchJson<ScheduledCall>(`${BASE_URL}/calls/scheduled/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        fetchJson<{ success: boolean }>(`${BASE_URL}/calls/scheduled/${id}`, {
          method: 'DELETE',
        }),
      pause: (id: string) =>
        fetchJson<ScheduledCall>(`${BASE_URL}/calls/scheduled/${id}/pause`, {
          method: 'POST',
        }),
      resume: (id: string) =>
        fetchJson<ScheduledCall>(`${BASE_URL}/calls/scheduled/${id}/resume`, {
          method: 'POST',
        }),
      trigger: (id: string) =>
        fetchJson<{ callLogId: string; twilioSid: string }>(`${BASE_URL}/calls/scheduled/${id}/trigger`, {
          method: 'POST',
        }),
    },
    history: {
      list: (params?: { status?: string; from?: string; to?: string; phone?: string; page?: number; limit?: number }) => {
        const searchParams = new URLSearchParams()
        if (params?.status) searchParams.set('status', params.status)
        if (params?.from) searchParams.set('from', params.from)
        if (params?.to) searchParams.set('to', params.to)
        if (params?.phone) searchParams.set('phone', params.phone)
        if (params?.page) searchParams.set('page', params.page.toString())
        if (params?.limit) searchParams.set('limit', params.limit.toString())
        return fetchJson<{ data: CallLog[]; pagination: Pagination }>(`${BASE_URL}/calls/history?${searchParams}`)
      },
      get: (id: string) => fetchJson<CallLog>(`${BASE_URL}/calls/history/${id}`),
      retry: (id: string) =>
        fetchJson<{ callLogId: string; twilioSid: string }>(`${BASE_URL}/calls/history/${id}/retry`, {
          method: 'POST',
        }),
    },
  },

  settings: {
    get: () => fetchJson<AppSettings>(`${BASE_URL}/settings`),
    update: (data: Partial<AppSettings>) =>
      fetchJson<AppSettings>(`${BASE_URL}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    testTwilio: () =>
      fetchJson<{ success: boolean; accountName?: string; phoneNumber?: string; error?: string }>(
        `${BASE_URL}/settings/test-twilio`,
        { method: 'POST' }
      ),
    getDefaults: () =>
      fetchJson<{ machineDetection: string; machineDetectionTimeout: number; postBeepDelay: number }>(
        `${BASE_URL}/settings/defaults`
      ),
    getStatus: () =>
      fetchJson<ServerStatus>(`${BASE_URL}/settings/status`),
  },

  setup: {
    status: () =>
      fetchJson<SetupStatus>(`${BASE_URL}/setup/status`),
    prerequisites: () =>
      fetchJson<{ ffmpeg: { installed: boolean; required: boolean; message: string } }>(
        `${BASE_URL}/setup/prerequisites`
      ),
    twilio: (data: { accountSid: string; authToken: string; phoneNumber: string }) =>
      fetchJson<{ success: boolean; accountName?: string; accountStatus?: string; error?: string }>(
        `${BASE_URL}/setup/twilio`,
        { method: 'POST', body: JSON.stringify(data) }
      ),
    twilioPhoneNumbers: () =>
      fetchJson<{ success: boolean; phoneNumbers: { sid: string; phoneNumber: string; friendlyName: string }[] }>(
        `${BASE_URL}/setup/twilio/phone-numbers`
      ),
    url: (data: { baseUrl: string; tunnelType?: string }) =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/setup/url`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    password: (data: { password?: string; skipPassword?: boolean }) =>
      fetchJson<{ success: boolean; passwordSet: boolean }>(`${BASE_URL}/setup/password`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    complete: () =>
      fetchJson<{ success: boolean; redirectTo: string }>(`${BASE_URL}/setup/complete`, {
        method: 'POST',
      }),
  },

  tunnel: {
    status: () =>
      fetchJson<TunnelStatus>(`${BASE_URL}/tunnel/status`),
    check: () =>
      fetchJson<Record<string, { available: boolean; message?: string }>>(`${BASE_URL}/tunnel/check`),
    config: () =>
      fetchJson<TunnelConfig>(`${BASE_URL}/tunnel/config`),
    updateConfig: (data: Partial<TunnelConfigUpdate>) =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/tunnel/config`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    start: (type: string) =>
      fetchJson<{ success: boolean; url?: string; error?: string }>(`${BASE_URL}/tunnel/start`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      }),
    stop: () =>
      fetchJson<{ success: boolean }>(`${BASE_URL}/tunnel/stop`, { method: 'POST' }),
    test: (url: string) =>
      fetchJson<{ success: boolean; message: string }>(`${BASE_URL}/tunnel/test`, {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
  },
}

export interface ServerStatus {
  appBaseUrl: string
  twilioPhoneNumber: string
  isLocalhost: boolean
  warnings: string[]
}

// Types
export interface Recording {
  id: string
  name: string
  description: string | null
  tags: string[]
  filename: string
  originalFilename: string
  mimeType: string
  duration: number
  size: number
  createdAt: string
  updatedAt: string
}

export interface Contact {
  id: string
  name: string
  phoneNumber: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Template {
  id: string
  name: string
  description: string | null
  recordingId: string | null
  recording: { id: string; name: string } | null
  contactId: string | null
  contact: { id: string; name: string; phoneNumber: string } | null
  machineDetection: string
  machineDetectionTimeout: number
  postBeepDelay: number
  twilioOptions: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateTemplateData {
  name: string
  description?: string | null
  recordingId?: string | null
  contactId?: string | null
  machineDetection?: string
  machineDetectionTimeout?: number
  postBeepDelay?: number
  twilioOptions?: Record<string, unknown>
}

export interface ScheduledCall {
  id: string
  phoneNumber: string
  contactId: string | null
  contact: { id: string; name: string; phoneNumber: string } | null
  recordingId: string
  recording: { id: string; name: string }
  scheduledAt: string
  recurrencePattern: string | null
  recurrenceEnabled: boolean
  machineDetection: string
  machineDetectionTimeout: number
  postBeepDelay: number
  twilioOptions: Record<string, unknown>
  status: string
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateScheduledCallData {
  phoneNumber: string
  contactId?: string | null
  recordingId: string
  scheduledAt: string
  recurrencePattern?: string | null
  recurrenceEnabled?: boolean
  machineDetection?: string
  machineDetectionTimeout?: number
  postBeepDelay?: number
  twilioOptions?: Record<string, unknown>
}

export interface CallLog {
  id: string
  scheduledCallId: string | null
  contactId: string | null
  contact: { id: string; name: string } | null
  phoneNumber: string
  recordingId: string
  recording: { id: string; name: string } | null
  twilioCallSid: string | null
  status: string
  amdResult: string | null
  duration: number | null
  errorCode: string | null
  errorMessage: string | null
  initiatedAt: string
  answeredAt: string | null
  endedAt: string | null
  retryOf: string | null
  createdAt: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AppSettings {
  defaultMachineDetection?: string
  defaultMachineDetectionTimeout?: number
  defaultPostBeepDelay?: number
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioPhoneNumber?: string
}

export interface SetupStatus {
  initialized: boolean
  setupComplete: boolean
  hasPassword: boolean
  hasFfmpeg: boolean
  authEnabled: boolean
}

export interface TunnelStatus {
  active: boolean
  type: string | null
  url: string | null
  error: string | null
  uptime?: number
}

export interface TunnelConfig {
  hasNgrokToken: boolean
  hasCloudflareToken: boolean
  ngrokRegion: string
  cloudflareTunnelId: string | null
  tunnelType: string | null
  autoStart: boolean
}

export interface TunnelConfigUpdate {
  ngrokAuthToken?: string
  ngrokRegion?: string
  cloudflareTunnelToken?: string
  cloudflareTunnelId?: string
  autoStart?: boolean
}
