import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits
const SALT = 'call4me-encryption-salt-v1'

export interface EncryptedData {
  encryptedValue: string
  iv: string
  authTag: string
}

class CryptoService {
  private encryptionKey: Buffer | null = null
  private appSecret: string | null = null
  private secretFilePath: string

  constructor() {
    this.secretFilePath = resolve(process.cwd(), 'data', '.app_secret')
  }

  async initialize(): Promise<void> {
    this.appSecret = await this.loadOrGenerateAppSecret()
    this.encryptionKey = this.deriveKey(this.appSecret)
  }

  private async loadOrGenerateAppSecret(): Promise<string> {
    // Check environment first (for migration from existing .env)
    if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) {
      return process.env.APP_SECRET
    }

    // Try loading from file
    if (existsSync(this.secretFilePath)) {
      const secret = readFileSync(this.secretFilePath, 'utf-8').trim()
      if (secret.length >= 32) {
        return secret
      }
    }

    // Generate new secret
    const secret = this.generateAppSecret()
    await this.saveSecret(secret)
    return secret
  }

  private async saveSecret(secret: string): Promise<void> {
    const dir = dirname(this.secretFilePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(this.secretFilePath, secret, { mode: 0o600 })
  }

  private deriveKey(secret: string): Buffer {
    return scryptSync(secret, SALT, KEY_LENGTH)
  }

  generateAppSecret(): string {
    return randomBytes(48).toString('base64')
  }

  getAppSecret(): string {
    if (!this.appSecret) {
      throw new Error('CryptoService not initialized. Call initialize() first.')
    }
    return this.appSecret
  }

  encrypt(plaintext: string): EncryptedData {
    if (!this.encryptionKey) {
      throw new Error('CryptoService not initialized. Call initialize() first.')
    }

    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    return {
      encryptedValue: encrypted,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    }
  }

  decrypt(data: EncryptedData): string {
    if (!this.encryptionKey) {
      throw new Error('CryptoService not initialized. Call initialize() first.')
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(data.iv, 'base64')
    )
    decipher.setAuthTag(Buffer.from(data.authTag, 'base64'))

    let decrypted = decipher.update(data.encryptedValue, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  isInitialized(): boolean {
    return this.encryptionKey !== null
  }
}

// Export singleton instance
export const cryptoService = new CryptoService()
