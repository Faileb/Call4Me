import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Phone,
  Globe,
  Lock,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: Check },
  { id: 'twilio', title: 'Twilio', icon: Phone },
  { id: 'tunnel', title: 'Network', icon: Globe },
  { id: 'password', title: 'Security', icon: Lock },
]

interface SetupWizardProps {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const queryClient = useQueryClient()

  // Twilio credentials state
  const [twilioAccountSid, setTwilioAccountSid] = useState('')
  const [twilioAuthToken, setTwilioAuthToken] = useState('')
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('')
  const [showAuthToken, setShowAuthToken] = useState(false)
  const [twilioValidated, setTwilioValidated] = useState(false)

  // Tunnel/URL state
  const [tunnelType, setTunnelType] = useState<string>('ngrok')
  const [baseUrl, setBaseUrl] = useState('')
  const [ngrokAuthToken, setNgrokAuthToken] = useState('')
  const [urlConfigured, setUrlConfigured] = useState(false)

  // Password state
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [skipPassword, setSkipPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Prerequisites query
  const { data: prerequisites } = useQuery({
    queryKey: ['prerequisites'],
    queryFn: api.setup.prerequisites,
  })

  // Tunnel availability check
  const { data: tunnelAvailability } = useQuery({
    queryKey: ['tunnelAvailability'],
    queryFn: api.tunnel.check,
  })

  // Twilio validation mutation
  const validateTwilioMutation = useMutation({
    mutationFn: () =>
      api.setup.twilio({
        accountSid: twilioAccountSid,
        authToken: twilioAuthToken,
        phoneNumber: twilioPhoneNumber,
      }),
    onSuccess: (result) => {
      if (result.success) {
        setTwilioValidated(true)
        toast.success(`Connected to ${result.accountName}`)
      } else {
        toast.error(result.error || 'Validation failed')
      }
    },
    onError: (error) => toast.error(error.message),
  })

  // Fetch phone numbers from Twilio
  const { data: phoneNumbers } = useQuery({
    queryKey: ['twilioPhoneNumbers'],
    queryFn: api.setup.twilioPhoneNumbers,
    enabled: twilioValidated,
  })

  // URL configuration mutation
  const configureUrlMutation = useMutation({
    mutationFn: () =>
      api.setup.url({ baseUrl, tunnelType }),
    onSuccess: () => {
      setUrlConfigured(true)
      toast.success('URL configured')
    },
    onError: (error) => toast.error(error.message),
  })

  // Start tunnel mutation
  const startTunnelMutation = useMutation({
    mutationFn: async () => {
      // If ngrok and has auth token, save it first
      if (tunnelType === 'ngrok' && ngrokAuthToken) {
        await api.tunnel.updateConfig({ ngrokAuthToken })
      }
      return api.tunnel.start(tunnelType)
    },
    onSuccess: (result) => {
      if (result.success && result.url) {
        setBaseUrl(result.url)
        setUrlConfigured(true)
        toast.success(`Tunnel started: ${result.url}`)
      } else {
        toast.error(result.error || 'Failed to start tunnel')
      }
    },
    onError: (error) => toast.error(error.message),
  })

  // Password mutation
  const setPasswordMutation = useMutation({
    mutationFn: () =>
      api.setup.password({ password: skipPassword ? undefined : password, skipPassword }),
    onSuccess: () => {
      toast.success(skipPassword ? 'Password skipped' : 'Password set')
    },
    onError: (error) => toast.error(error.message),
  })

  // Complete setup mutation
  const completeSetupMutation = useMutation({
    mutationFn: api.setup.complete,
    onSuccess: () => {
      queryClient.invalidateQueries()
      toast.success('Setup complete!')
      onComplete()
    },
    onError: (error) => toast.error(error.message),
  })

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return true
      case 1:
        return twilioValidated
      case 2:
        return urlConfigured || baseUrl.length > 0
      case 3:
        return skipPassword || (password.length >= 8 && password === confirmPassword)
      default:
        return false
    }
  }

  const handleNext = async () => {
    if (currentStep === 2 && !urlConfigured && baseUrl) {
      // Save URL before proceeding
      await configureUrlMutation.mutateAsync()
    }
    if (currentStep === 3) {
      // Set password before completing
      await setPasswordMutation.mutateAsync()
      await completeSetupMutation.mutateAsync()
      return
    }
    setCurrentStep((prev) => prev + 1)
  }

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Call4Me Setup</h1>
      </div>

      {/* Progress Steps */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = index === currentStep
            const isComplete = index < currentStep

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={clsx(
                    'flex items-center justify-center w-10 h-10 rounded-full',
                    isComplete
                      ? 'bg-green-500 text-white'
                      : isActive
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  )}
                >
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={clsx(
                    'ml-2 text-sm font-medium',
                    isActive ? 'text-gray-900' : 'text-gray-500'
                  )}
                >
                  {step.title}
                </span>
                {index < STEPS.length - 1 && (
                  <ChevronRight className="w-5 h-5 text-gray-300 mx-4" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto">
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Welcome to Call4Me
              </h2>
              <p className="text-gray-600 mb-6">
                Call4Me is an automated phone calling application powered by
                Twilio. This setup wizard will help you configure the essential
                settings to get started.
              </p>

              <div className="space-y-4 mb-6">
                <h3 className="font-semibold text-gray-900">What you'll need:</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>A Twilio account with API credentials</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>A Twilio phone number for outbound calls</span>
                  </li>
                  <li className="flex items-start gap-2">
                    {prerequisites?.ffmpeg.installed ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    )}
                    <span>
                      FFmpeg for audio conversion{' '}
                      {prerequisites?.ffmpeg.installed
                        ? '(detected)'
                        : '(optional - needed for browser recordings)'}
                    </span>
                  </li>
                </ul>
              </div>

              <p className="text-sm text-gray-500">
                Don't have a Twilio account?{' '}
                <a
                  href="https://www.twilio.com/try-twilio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Sign up for free
                </a>
              </p>
            </div>
          )}

          {/* Step 1: Twilio Configuration */}
          {currentStep === 1 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Twilio Configuration
              </h2>
              <p className="text-gray-600 mb-6">
                Enter your Twilio credentials. You can find these in your{' '}
                <a
                  href="https://console.twilio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Twilio Console
                </a>
                .
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account SID
                  </label>
                  <input
                    type="text"
                    value={twilioAccountSid}
                    onChange={(e) => {
                      setTwilioAccountSid(e.target.value)
                      setTwilioValidated(false)
                    }}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Auth Token
                  </label>
                  <div className="relative">
                    <input
                      type={showAuthToken ? 'text' : 'password'}
                      value={twilioAuthToken}
                      onChange={(e) => {
                        setTwilioAuthToken(e.target.value)
                        setTwilioValidated(false)
                      }}
                      placeholder="Your auth token"
                      className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthToken(!showAuthToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showAuthToken ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1">
                      Phone Number
                      <span className="relative group">
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10">
                          This is your Twilio phone number that will appear as the caller ID for outbound calls. Find it in your{' '}
                          <span className="underline">Twilio Console → Phone Numbers → Manage → Active Numbers</span>
                        </span>
                      </span>
                    </span>
                  </label>
                  {phoneNumbers?.phoneNumbers && phoneNumbers.phoneNumbers.length > 0 ? (
                    <select
                      value={twilioPhoneNumber}
                      onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                      <option value="">Select a phone number</option>
                      {phoneNumbers.phoneNumbers.map((num) => (
                        <option key={num.sid} value={num.phoneNumber}>
                          {num.phoneNumber} ({num.friendlyName})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={twilioPhoneNumber}
                      onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                      placeholder="+1234567890"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                    />
                  )}
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button
                    onClick={() => validateTwilioMutation.mutate()}
                    disabled={
                      !twilioAccountSid ||
                      !twilioAuthToken ||
                      !twilioPhoneNumber ||
                      validateTwilioMutation.isPending
                    }
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {validateTwilioMutation.isPending ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Validate Credentials
                  </button>

                  {twilioValidated && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      Validated
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Network/Tunnel Configuration */}
          {currentStep === 2 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Network Configuration
              </h2>
              <p className="text-gray-600 mb-6">
                Twilio needs to reach your server to deliver call status updates.
                Choose how you want to expose your server to the internet.
              </p>

              <div className="space-y-6">
                {/* Tunnel Type Selection */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    {
                      id: 'ngrok',
                      name: 'ngrok',
                      desc: 'Easiest - works out of the box',
                      available: true,
                    },
                    {
                      id: 'tailscale',
                      name: 'Tailscale Funnel',
                      desc: 'Requires Tailscale setup',
                      available: tunnelAvailability?.tailscale?.available,
                    },
                    {
                      id: 'cloudflare',
                      name: 'Cloudflare Tunnel',
                      desc: 'Requires cloudflared CLI',
                      available: tunnelAvailability?.cloudflare?.available,
                    },
                    {
                      id: 'manual',
                      name: 'Manual URL',
                      desc: 'I have my own public URL',
                      available: true,
                    },
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setTunnelType(option.id)}
                      disabled={!option.available}
                      className={clsx(
                        'p-4 rounded-lg border-2 text-left transition-colors',
                        tunnelType === option.id
                          ? 'border-primary-500 bg-primary-50'
                          : option.available
                            ? 'border-gray-200 hover:border-gray-300'
                            : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                      )}
                    >
                      <div className="font-medium text-gray-900">
                        {option.name}
                      </div>
                      <div className="text-sm text-gray-500">{option.desc}</div>
                    </button>
                  ))}
                </div>

                {/* ngrok configuration */}
                {tunnelType === 'ngrok' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ngrok Auth Token (optional)
                      </label>
                      <input
                        type="password"
                        value={ngrokAuthToken}
                        onChange={(e) => setNgrokAuthToken(e.target.value)}
                        placeholder="Your ngrok auth token (optional for basic usage)"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Get your auth token from{' '}
                        <a
                          href="https://dashboard.ngrok.com/get-started/your-authtoken"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          dashboard.ngrok.com
                        </a>
                      </p>
                    </div>

                    <button
                      onClick={() => startTunnelMutation.mutate()}
                      disabled={startTunnelMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {startTunnelMutation.isPending ? (
                        <Loader className="w-4 h-4 animate-spin" />
                      ) : (
                        <Globe className="w-4 h-4" />
                      )}
                      Start ngrok Tunnel
                    </button>
                  </div>
                )}

                {/* Manual URL */}
                {tunnelType === 'manual' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Public URL
                    </label>
                    <input
                      type="url"
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value)
                        setUrlConfigured(false)
                      }}
                      placeholder="https://your-domain.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                )}

                {/* Status */}
                {(urlConfigured || baseUrl) && (
                  <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <div className="font-medium text-green-800">URL Configured</div>
                      <div className="text-sm text-green-700 font-mono">{baseUrl}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Password */}
          {currentStep === 3 && (
            <div className="bg-white rounded-xl shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Security Settings
              </h2>
              <p className="text-gray-600 mb-6">
                Set a password to protect your Call4Me installation, or skip to
                allow passwordless access.
              </p>

              <div className="space-y-6">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipPassword}
                    onChange={(e) => setSkipPassword(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-gray-700">
                    Skip password setup (not recommended for public networks)
                  </span>
                </label>

                {!skipPassword && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className={clsx(
                          'w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none',
                          confirmPassword && confirmPassword !== password
                            ? 'border-red-300'
                            : 'border-gray-300'
                        )}
                      />
                      {confirmPassword && confirmPassword !== password && (
                        <p className="text-sm text-red-600 mt-1">
                          Passwords do not match
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={!canProceed() || completeSetupMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {completeSetupMutation.isPending ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Completing...
              </>
            ) : currentStep === STEPS.length - 1 ? (
              <>
                Complete Setup
                <Check className="w-5 h-5" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
