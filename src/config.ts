import 'dotenv/config'

// Bootstrap config - provides defaults for startup before DB is available
// Full dynamic config comes from configService after initialization

export interface Config {
  // Twilio (loaded from configService/secrets)
  twilioAccountSid: string | null
  twilioAuthToken: string | null
  twilioPhoneNumber: string | null

  // App
  port: number
  appSecret: string
  appBaseUrl: string | null
  appPassword: string | null
  appPasswordHash: string | null

  // Storage
  recordingsPath: string

  // SSL/TLS
  sslKeyPath: string | null
  sslCertPath: string | null
  sslPort: number

  // Options
  logLevel: 'error' | 'warn' | 'info' | 'debug'
  disableAuth: boolean
  isProduction: boolean

  // Setup state
  isSetupMode: boolean
}

// Mutable config object that can be updated after initialization
const configData: Config = {
  // Twilio - will be loaded from configService
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || null,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || null,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || null,

  // App settings
  port: parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10),
  appSecret: process.env.APP_SECRET || '', // Will be loaded from crypto service
  appBaseUrl: process.env.APP_BASE_URL || null,
  appPassword: process.env.APP_PASSWORD || null,
  appPasswordHash: process.env.APP_PASSWORD_HASH || null,

  // Storage
  recordingsPath: process.env.RECORDINGS_PATH || './data/recordings',

  // SSL/TLS
  sslKeyPath: process.env.SSL_KEY_PATH || null,
  sslCertPath: process.env.SSL_CERT_PATH || null,
  sslPort: parseInt(process.env.SSL_PORT || '3443', 10),

  // Options
  logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'info',
  disableAuth: process.env.DISABLE_AUTH === 'true',
  isProduction: process.env.NODE_ENV === 'production',

  // Setup mode - will be determined during initialization
  isSetupMode: false,
}

// Update config values after initialization
export function updateConfig(updates: Partial<Config>): void {
  Object.assign(configData, updates)
}

// Check if the app has required config to run normally
export function hasRequiredConfig(): boolean {
  return !!(
    configData.twilioAccountSid &&
    configData.twilioAuthToken &&
    configData.twilioPhoneNumber &&
    configData.appBaseUrl
  )
}

// Export as proxy to ensure we always get current values
export const config: Config = new Proxy(configData, {
  get(target, prop: keyof Config) {
    return target[prop]
  },
  set(target, prop: keyof Config, value) {
    ;(target as unknown as Record<string, unknown>)[prop] = value
    return true
  },
})
