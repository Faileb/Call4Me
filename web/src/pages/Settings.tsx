import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings as SettingsIcon, Key, Phone, Shield, Check, X, Loader, AlertTriangle, Globe, Eye, EyeOff, Info, Edit2, Wifi, WifiOff, Play, Square } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'

export function Settings() {
  const [changePassword, setChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Twilio editing state
  const [editingTwilio, setEditingTwilio] = useState(false)
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('')
  const [showAuthToken, setShowAuthToken] = useState(false)

  // Tunnel editing state
  const [editingTunnel, setEditingTunnel] = useState(false)
  const [ngrokAuthToken, setNgrokAuthToken] = useState('')
  const [showNgrokToken, setShowNgrokToken] = useState(false)
  const [selectedTunnelType, setSelectedTunnelType] = useState<string>('ngrok')

  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  })

  const { data: defaults } = useQuery({
    queryKey: ['settings', 'defaults'],
    queryFn: api.settings.getDefaults,
  })

  const { data: status } = useQuery({
    queryKey: ['settings', 'status'],
    queryFn: api.settings.getStatus,
  })

  const { data: tunnelStatus } = useQuery({
    queryKey: ['tunnel', 'status'],
    queryFn: api.tunnel.status,
    refetchInterval: 5000, // Poll every 5 seconds
  })

  const { data: tunnelConfig } = useQuery({
    queryKey: ['tunnel', 'config'],
    queryFn: api.tunnel.config,
  })

  const { data: tunnelAvailability } = useQuery({
    queryKey: ['tunnel', 'availability'],
    queryFn: api.tunnel.check,
  })

  const updateMutation = useMutation({
    mutationFn: api.settings.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const testTwilioMutation = useMutation({
    mutationFn: api.settings.testTwilio,
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Connected to ${result.accountName}`)
      } else {
        toast.error(result.error || 'Connection failed')
      }
    },
    onError: (error) => toast.error(error.message),
  })

  const changePasswordMutation = useMutation({
    mutationFn: () => api.auth.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setChangePassword(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password changed')
    },
    onError: (error) => toast.error(error.message),
  })

  const updateTwilioMutation = useMutation({
    mutationFn: () =>
      api.settings.update({
        twilioAccountSid,
        twilioAuthToken: twilioAuthToken || undefined,
        twilioPhoneNumber,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setEditingTwilio(false)
      setTwilioAuthToken('')
      toast.success('Twilio settings updated')
    },
    onError: (error) => toast.error(error.message),
  })

  // Tunnel mutations
  const updateTunnelConfigMutation = useMutation({
    mutationFn: (data: { ngrokAuthToken?: string; autoStart?: boolean }) =>
      api.tunnel.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnel', 'config'] })
      setEditingTunnel(false)
      setNgrokAuthToken('')
      toast.success('Tunnel settings updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const startTunnelMutation = useMutation({
    mutationFn: (type: string) => api.tunnel.start(type),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['tunnel'] })
        queryClient.invalidateQueries({ queryKey: ['settings', 'status'] })
        toast.success(`Tunnel started: ${result.url}`)
      } else {
        toast.error(result.error || 'Failed to start tunnel')
      }
    },
    onError: (error) => toast.error(error.message),
  })

  const stopTunnelMutation = useMutation({
    mutationFn: api.tunnel.stop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnel'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'status'] })
      toast.success('Tunnel stopped')
    },
    onError: (error) => toast.error(error.message),
  })

  // Initialize Twilio edit form when entering edit mode
  const startEditingTwilio = () => {
    setTwilioAccountSid(settings?.twilioAccountSid || '')
    setTwilioPhoneNumber(settings?.twilioPhoneNumber || '')
    setTwilioAuthToken('') // Don't pre-fill auth token for security
    setEditingTwilio(true)
  }

  const cancelEditingTwilio = () => {
    setEditingTwilio(false)
    setTwilioAccountSid('')
    setTwilioAuthToken('')
    setTwilioPhoneNumber('')
  }

  // Initialize Tunnel edit form
  const startEditingTunnel = () => {
    setNgrokAuthToken('')
    setSelectedTunnelType(tunnelConfig?.tunnelType || 'ngrok')
    setEditingTunnel(true)
  }

  const cancelEditingTunnel = () => {
    setEditingTunnel(false)
    setNgrokAuthToken('')
  }

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    changePasswordMutation.mutate()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Manage your application settings</p>
      </div>

      {/* Configuration Warnings */}
      {status?.warnings && status.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-medium text-yellow-800">Configuration Warning</h3>
              {status.warnings.map((warning, i) => (
                <p key={i} className="text-sm text-yellow-700">{warning}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Network / Tunnel Configuration */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold">Network Configuration</h2>
          </div>
          {!editingTunnel && (
            <button
              onClick={startEditingTunnel}
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>

        {!editingTunnel ? (
          <div className="space-y-4">
            {/* Current URL */}
            <div>
              <p className="text-sm text-gray-500">Webhook Base URL</p>
              <p className="font-mono text-sm">
                {status?.appBaseUrl || 'Not configured'}
              </p>
              {status?.isLocalhost && (
                <p className="text-xs text-yellow-600 mt-1">
                  Twilio cannot reach localhost. Start a tunnel or use a public URL.
                </p>
              )}
            </div>

            {/* Tunnel Status */}
            <div>
              <p className="text-sm text-gray-500">Tunnel Status</p>
              <div className="flex items-center gap-2 mt-1">
                {tunnelStatus?.active ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-600">
                      Active ({tunnelStatus.type})
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-500">Not running</span>
                  </>
                )}
              </div>
              {tunnelStatus?.url && (
                <p className="font-mono text-xs text-gray-500 mt-1">{tunnelStatus.url}</p>
              )}
              {tunnelStatus?.error && (
                <p className="text-xs text-red-600 mt-1">{tunnelStatus.error}</p>
              )}
            </div>

            {/* ngrok Auth Token Status */}
            <div>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                ngrok Auth Token
                <span className="relative group">
                  <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-56 pointer-events-none z-10">
                    Optional auth token from ngrok dashboard. Required for custom domains and longer session times.
                  </span>
                </span>
              </p>
              <p className="text-sm">
                {tunnelConfig?.hasNgrokToken ? (
                  <span className="text-green-600">Configured</span>
                ) : (
                  <span className="text-gray-500">Not configured (using free tier)</span>
                )}
              </p>
            </div>

            {/* Tunnel Controls */}
            <div className="flex gap-3 pt-2">
              {tunnelStatus?.active ? (
                <button
                  onClick={() => stopTunnelMutation.mutate()}
                  disabled={stopTunnelMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {stopTunnelMutation.isPending ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  Stop Tunnel
                </button>
              ) : (
                <button
                  onClick={() => startTunnelMutation.mutate('ngrok')}
                  disabled={startTunnelMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {startTunnelMutation.isPending ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Start ngrok Tunnel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tunnel Type Selection */}
            <div>
              <label className="block text-sm text-gray-500 mb-2">Tunnel Service</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'ngrok', name: 'ngrok', available: true },
                  { id: 'tailscale', name: 'Tailscale Funnel', available: tunnelAvailability?.tailscale?.available },
                  { id: 'cloudflare', name: 'Cloudflare Tunnel', available: tunnelAvailability?.cloudflare?.available },
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setSelectedTunnelType(option.id)}
                    disabled={!option.available}
                    className={clsx(
                      'p-3 rounded-lg border-2 text-left text-sm transition-colors',
                      selectedTunnelType === option.id
                        ? 'border-primary-500 bg-primary-50'
                        : option.available
                          ? 'border-gray-200 hover:border-gray-300'
                          : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                    )}
                  >
                    {option.name}
                    {!option.available && <span className="block text-xs text-gray-400">Not available</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* ngrok Auth Token */}
            {selectedTunnelType === 'ngrok' && (
              <div>
                <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1">
                  ngrok Auth Token
                  <span className="relative group">
                    <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10">
                      Get your auth token from{' '}
                      <span className="underline">dashboard.ngrok.com/get-started/your-authtoken</span>
                    </span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showNgrokToken ? 'text' : 'password'}
                    value={ngrokAuthToken}
                    onChange={(e) => setNgrokAuthToken(e.target.value)}
                    placeholder={tunnelConfig?.hasNgrokToken ? 'Leave blank to keep existing token' : 'Enter auth token (optional)'}
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNgrokToken(!showNgrokToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showNgrokToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Optional. Enables longer sessions and custom domains.{' '}
                  <a
                    href="https://dashboard.ngrok.com/get-started/your-authtoken"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline"
                  >
                    Get your token
                  </a>
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={cancelEditingTunnel}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={() => updateTunnelConfigMutation.mutate({ ngrokAuthToken: ngrokAuthToken || undefined })}
                disabled={updateTunnelConfigMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {updateTunnelConfigMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Twilio Connection */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold">Twilio Connection</h2>
          </div>
          {!editingTwilio && (
            <button
              onClick={startEditingTwilio}
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>

        {!editingTwilio ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Account SID</p>
              <p className="font-mono text-sm">
                {settings?.twilioAccountSid || 'Not configured'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                Phone Number
                <span className="relative group">
                  <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-56 pointer-events-none z-10">
                    Your Twilio phone number that appears as caller ID. Find it in Twilio Console → Phone Numbers → Active Numbers
                  </span>
                </span>
              </p>
              <p className="font-mono text-sm">
                {settings?.twilioPhoneNumber || 'Not configured'}
              </p>
            </div>

            <button
              onClick={() => testTwilioMutation.mutate()}
              disabled={testTwilioMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {testTwilioMutation.isPending ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Test Connection
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Account SID</label>
              <input
                type="text"
                value={twilioAccountSid}
                onChange={(e) => setTwilioAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Auth Token</label>
              <div className="relative">
                <input
                  type={showAuthToken ? 'text' : 'password'}
                  value={twilioAuthToken}
                  onChange={(e) => setTwilioAuthToken(e.target.value)}
                  placeholder="Leave blank to keep existing token"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowAuthToken(!showAuthToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showAuthToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Leave blank to keep the existing token</p>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1">
                Phone Number
                <span className="relative group">
                  <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-56 pointer-events-none z-10">
                    Your Twilio phone number that appears as caller ID. Find it in Twilio Console → Phone Numbers → Active Numbers
                  </span>
                </span>
              </label>
              <input
                type="text"
                value={twilioPhoneNumber}
                onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelEditingTwilio}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={() => updateTwilioMutation.mutate()}
                disabled={updateTwilioMutation.isPending || !twilioAccountSid || !twilioPhoneNumber}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {updateTwilioMutation.isPending ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Default Call Settings */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <SettingsIcon className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold">Default Call Settings</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Machine Detection</label>
            <select
              value={defaults?.machineDetection || 'DetectMessageEnd'}
              onChange={(e) => updateMutation.mutate({ defaultMachineDetection: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="DetectMessageEnd">Detect Message End</option>
              <option value="Enable">Enable</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Detection Timeout (s)</label>
              <input
                type="number"
                defaultValue={defaults?.machineDetectionTimeout || 30}
                min={2}
                max={60}
                onBlur={(e) => updateMutation.mutate({ defaultMachineDetectionTimeout: parseInt(e.target.value) || 30 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Post-Beep Delay (s)</label>
              <input
                type="number"
                defaultValue={defaults?.postBeepDelay || 0}
                min={0}
                max={10}
                step={0.5}
                onBlur={(e) => updateMutation.mutate({ defaultPostBeepDelay: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold">Security</h2>
        </div>

        {!changePassword ? (
          <button
            onClick={() => setChangePassword(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Key className="w-4 h-4" />
            Change Password
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={clsx(
                  'w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none',
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-red-300'
                    : 'border-gray-300'
                )}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setChangePassword(false)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {changePasswordMutation.isPending ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
