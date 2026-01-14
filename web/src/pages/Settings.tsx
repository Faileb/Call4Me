import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings as SettingsIcon, Key, Phone, Shield, Check, X, Loader, AlertTriangle, Globe } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'

export function Settings() {
  const [changePassword, setChangePassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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

      {/* Server Configuration */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold">Server Configuration</h2>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Webhook Base URL</p>
            <p className="font-mono text-sm">
              {status?.appBaseUrl || 'Loading...'}
            </p>
            {status?.isLocalhost && (
              <p className="text-xs text-yellow-600 mt-1">
                Twilio cannot reach localhost. Use ngrok or deploy to a public server.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Twilio Connection */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <Phone className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold">Twilio Connection</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500">Account SID</p>
            <p className="font-mono text-sm">
              {settings?.twilioAccountSid || 'Configured via environment'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Phone Number</p>
            <p className="font-mono text-sm">
              {settings?.twilioPhoneNumber || 'Configured via environment'}
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
