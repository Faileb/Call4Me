import { PrismaClient, AppConfig, TunnelConfig } from '@prisma/client'
import { cryptoService, EncryptedData } from './crypto.js'

// Secret keys that can be stored encrypted
export type SecretKey =
  | 'twilioAccountSid'
  | 'twilioAuthToken'
  | 'twilioPhoneNumber'
  | 'ngrokAuthToken'
  | 'cloudflareTunnelToken'
  | 'passwordHash'

// Config keys that map to AppConfig fields
export type ConfigKey = keyof Omit<AppConfig, 'id' | 'createdAt' | 'updatedAt'>

// Tunnel config keys
export type TunnelConfigKey = keyof Omit<TunnelConfig, 'id' | 'createdAt' | 'updatedAt'>

// Default values for config
const CONFIG_DEFAULTS: Partial<AppConfig> = {
  initialized: false,
  setupComplete: false,
  appPort: 3000,
  logLevel: 'info',
  timezone: 'UTC',
  recordingsPath: './data/recordings',
  tunnelAutoStart: false,
  disableAuth: false,
}

// Environment variable mapping for backwards compatibility
const ENV_MAP: Record<string, ConfigKey | SecretKey> = {
  APP_PORT: 'appPort',
  PORT: 'appPort',
  LOG_LEVEL: 'logLevel',
  TZ: 'timezone',
  RECORDINGS_PATH: 'recordingsPath',
  APP_BASE_URL: 'appBaseUrl',
  DISABLE_AUTH: 'disableAuth',
  TWILIO_ACCOUNT_SID: 'twilioAccountSid',
  TWILIO_AUTH_TOKEN: 'twilioAuthToken',
  TWILIO_PHONE_NUMBER: 'twilioPhoneNumber',
}

class ConfigService {
  private prisma: PrismaClient | null = null
  private configCache: AppConfig | null = null
  private tunnelConfigCache: TunnelConfig | null = null
  private secretsCache: Map<string, string> = new Map()
  private initialized = false

  setPrisma(prisma: PrismaClient): void {
    this.prisma = prisma
  }

  async initialize(): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not set. Call setPrisma() first.')
    }
    await this.loadConfig()
    this.initialized = true
  }

  private async loadConfig(): Promise<void> {
    if (!this.prisma) return

    // Load or create AppConfig
    this.configCache = await this.prisma.appConfig.findUnique({
      where: { id: 'singleton' },
    })

    if (!this.configCache) {
      // Create default config
      this.configCache = await this.prisma.appConfig.create({
        data: { id: 'singleton' },
      })
    }

    // Load TunnelConfig
    this.tunnelConfigCache = await this.prisma.tunnelConfig.findUnique({
      where: { id: 'singleton' },
    })

    if (!this.tunnelConfigCache) {
      this.tunnelConfigCache = await this.prisma.tunnelConfig.create({
        data: { id: 'singleton' },
      })
    }

    // Preload all secrets into cache
    const secrets = await this.prisma.secret.findMany()
    for (const secret of secrets) {
      try {
        const decrypted = cryptoService.decrypt({
          encryptedValue: secret.encryptedValue,
          iv: secret.iv,
          authTag: secret.authTag,
        })
        this.secretsCache.set(secret.key, decrypted)
      } catch (error) {
        console.error(`Failed to decrypt secret: ${secret.key}`, error)
      }
    }
  }

  async isSetupComplete(): Promise<boolean> {
    if (!this.configCache) {
      await this.loadConfig()
    }
    return this.configCache?.setupComplete ?? false
  }

  async isInitialized(): Promise<boolean> {
    if (!this.configCache) {
      await this.loadConfig()
    }
    return this.configCache?.initialized ?? false
  }

  // Get a config value with priority: env > database > default
  async get<T extends ConfigKey>(key: T): Promise<AppConfig[T]> {
    // Check environment variable first
    const envValue = this.getFromEnv(key)
    if (envValue !== undefined) {
      return envValue as AppConfig[T]
    }

    // Check database
    if (!this.configCache) {
      await this.loadConfig()
    }

    const dbValue = this.configCache?.[key]
    if (dbValue !== undefined && dbValue !== null) {
      return dbValue
    }

    // Return default
    return CONFIG_DEFAULTS[key] as AppConfig[T]
  }

  private getFromEnv(key: string): unknown {
    // Find the env var that maps to this key
    const envVar = Object.entries(ENV_MAP).find(([_, v]) => v === key)?.[0]
    if (!envVar || !process.env[envVar]) {
      return undefined
    }

    const value = process.env[envVar]

    // Type coercion
    if (key === 'appPort') {
      return parseInt(value!, 10)
    }
    if (key === 'disableAuth' || key === 'tunnelAutoStart') {
      return value === 'true'
    }

    return value
  }

  // Set a config value
  async set<T extends ConfigKey>(key: T, value: AppConfig[T]): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not set.')
    }

    await this.prisma.appConfig.update({
      where: { id: 'singleton' },
      data: { [key]: value },
    })

    // Update cache
    if (this.configCache) {
      (this.configCache as Record<string, unknown>)[key] = value
    }
  }

  // Set multiple config values at once
  async setMany(values: Partial<AppConfig>): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not set.')
    }

    // Remove id, createdAt, updatedAt from values
    const { id, createdAt, updatedAt, ...data } = values as AppConfig

    await this.prisma.appConfig.update({
      where: { id: 'singleton' },
      data,
    })

    // Update cache
    if (this.configCache) {
      Object.assign(this.configCache, data)
    }
  }

  // Get a secret value with priority: env > database
  async getSecret(key: SecretKey): Promise<string | null> {
    // Check environment variable first
    const envValue = this.getFromEnv(key) as string | undefined
    if (envValue !== undefined) {
      return envValue
    }

    // Check cache
    if (this.secretsCache.has(key)) {
      return this.secretsCache.get(key)!
    }

    // Not found
    return null
  }

  // Set a secret value (encrypted)
  async setSecret(key: SecretKey, value: string): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not set.')
    }

    const encrypted = cryptoService.encrypt(value)

    await this.prisma.secret.upsert({
      where: { key },
      create: {
        key,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      update: {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
    })

    // Update cache
    this.secretsCache.set(key, value)
  }

  // Delete a secret
  async deleteSecret(key: SecretKey): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not set.')
    }

    await this.prisma.secret.deleteMany({
      where: { key },
    })

    this.secretsCache.delete(key)
  }

  // Check if a secret exists (in env or database)
  async hasSecret(key: SecretKey): Promise<boolean> {
    const value = await this.getSecret(key)
    return value !== null && value.length > 0
  }

  // Tunnel config methods
  async getTunnelConfig<T extends TunnelConfigKey>(key: T): Promise<TunnelConfig[T]> {
    if (!this.tunnelConfigCache) {
      await this.loadConfig()
    }
    return this.tunnelConfigCache?.[key] as TunnelConfig[T]
  }

  async setTunnelConfig<T extends TunnelConfigKey>(
    key: T,
    value: TunnelConfig[T]
  ): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not set.')
    }

    await this.prisma.tunnelConfig.update({
      where: { id: 'singleton' },
      data: { [key]: value },
    })

    if (this.tunnelConfigCache) {
      (this.tunnelConfigCache as Record<string, unknown>)[key] = value
    }
  }

  async setTunnelConfigMany(values: Partial<TunnelConfig>): Promise<void> {
    if (!this.prisma) {
      throw new Error('Prisma client not set.')
    }

    const { id, createdAt, updatedAt, ...data } = values as TunnelConfig

    await this.prisma.tunnelConfig.update({
      where: { id: 'singleton' },
      data,
    })

    if (this.tunnelConfigCache) {
      Object.assign(this.tunnelConfigCache, data)
    }
  }

  // Get all config as an object (for API responses)
  async getAllConfig(): Promise<{
    app: Partial<AppConfig>
    tunnel: Partial<TunnelConfig>
    secrets: Record<string, boolean> // Just indicates if set, not the value
  }> {
    if (!this.configCache) {
      await this.loadConfig()
    }

    const secretKeys: SecretKey[] = [
      'twilioAccountSid',
      'twilioAuthToken',
      'twilioPhoneNumber',
      'ngrokAuthToken',
      'cloudflareTunnelToken',
      'passwordHash',
    ]

    const secretsStatus: Record<string, boolean> = {}
    for (const key of secretKeys) {
      secretsStatus[key] = await this.hasSecret(key)
    }

    return {
      app: {
        initialized: this.configCache?.initialized,
        setupComplete: this.configCache?.setupComplete,
        appPort: await this.get('appPort'),
        logLevel: await this.get('logLevel'),
        timezone: await this.get('timezone'),
        recordingsPath: await this.get('recordingsPath'),
        appBaseUrl: await this.get('appBaseUrl'),
        tunnelType: await this.get('tunnelType'),
        tunnelAutoStart: await this.get('tunnelAutoStart'),
        disableAuth: await this.get('disableAuth'),
      },
      tunnel: {
        ngrokRegion: this.tunnelConfigCache?.ngrokRegion,
        tailscaleFunnelPort: this.tunnelConfigCache?.tailscaleFunnelPort,
        cloudflareTunnelId: this.tunnelConfigCache?.cloudflareTunnelId,
        tunnelActive: this.tunnelConfigCache?.tunnelActive,
        tunnelUrl: this.tunnelConfigCache?.tunnelUrl,
        tunnelError: this.tunnelConfigCache?.tunnelError,
      },
      secrets: secretsStatus,
    }
  }

  // Reload config from database
  async reload(): Promise<void> {
    this.configCache = null
    this.tunnelConfigCache = null
    this.secretsCache.clear()
    await this.loadConfig()
  }

  // Mark setup as complete
  async completeSetup(): Promise<void> {
    await this.setMany({
      initialized: true,
      setupComplete: true,
    })
  }
}

// Export singleton instance
export const configService = new ConfigService()
