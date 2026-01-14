import { Router } from 'express'
import argon2 from 'argon2'
import rateLimit from 'express-rate-limit'
import { config } from '../../config.js'
import { configService } from '../../services/configService.js'
import { logger } from '../../utils/logger.js'

export const authRouter = Router()

// Rate limit login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Cache for password hash (computed on first use)
let passwordHashCache: string | null = null

async function getPasswordHash(): Promise<string | null> {
  // First check database (via configService)
  const dbHash = await configService.getSecret('passwordHash')
  if (dbHash) {
    return dbHash
  }

  // Fall back to environment variable (for migration)
  if (passwordHashCache) return passwordHashCache

  if (config.appPasswordHash) {
    passwordHashCache = config.appPasswordHash
    return passwordHashCache
  }

  if (config.appPassword) {
    passwordHashCache = await argon2.hash(config.appPassword)
    logger.info('Password hash computed from APP_PASSWORD environment variable')
    return passwordHashCache
  }

  return null
}

// Check session status
authRouter.get('/session', async (req, res) => {
  const hasPassword = await configService.hasSecret('passwordHash')
  const authEnabled = !config.disableAuth && hasPassword

  res.json({
    authenticated: config.disableAuth || !authEnabled || !!req.session?.authenticated,
    authEnabled,
    hasPassword,
    isSetupMode: config.isSetupMode,
  })
})

// Login
authRouter.post('/login', loginLimiter, async (req, res) => {
  try {
    // Check if auth is enabled
    const hasPassword = await configService.hasSecret('passwordHash')
    if (config.disableAuth || !hasPassword) {
      // Auth disabled or no password - auto-authenticate
      req.session.authenticated = true
      return res.json({ success: true })
    }

    const { password } = req.body

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' })
    }

    const hash = await getPasswordHash()
    if (!hash) {
      logger.error('No password configured')
      return res.status(500).json({ error: 'Authentication not configured' })
    }

    const valid = await argon2.verify(hash, password)
    if (!valid) {
      logger.warn({ ip: req.ip }, 'Failed login attempt')
      return res.status(401).json({ error: 'Invalid password' })
    }

    req.session.authenticated = true
    logger.info({ ip: req.ip }, 'Successful login')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Login error')
    res.status(500).json({ error: 'Login failed' })
  }
})

// Logout
authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, 'Logout error')
      return res.status(500).json({ error: 'Logout failed' })
    }
    res.clearCookie('connect.sid')
    res.json({ success: true })
  })
})

// Change password (requires current session)
authRouter.post('/change-password', async (req, res) => {
  if (!req.session?.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new passwords are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }

    const hash = await getPasswordHash()
    if (!hash) {
      return res.status(500).json({ error: 'Authentication not configured' })
    }

    const valid = await argon2.verify(hash, currentPassword)
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    // Hash and store new password in database
    const newHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    })

    await configService.setSecret('passwordHash', newHash)
    passwordHashCache = null // Clear cache so next login uses DB value

    logger.info('Password changed successfully')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Change password error')
    res.status(500).json({ error: 'Failed to change password' })
  }
})

// Set password (for initial setup or when no password exists)
authRouter.post('/set-password', async (req, res) => {
  try {
    const existingHash = await getPasswordHash()

    // If password already exists, require authentication
    if (existingHash && !req.session?.authenticated) {
      return res.status(401).json({ error: 'Unauthorized - use change-password endpoint' })
    }

    const { password } = req.body

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Hash and store password
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    })

    await configService.setSecret('passwordHash', hash)
    await configService.set('disableAuth', false)
    passwordHashCache = null

    logger.info('Password set successfully')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Set password error')
    res.status(500).json({ error: 'Failed to set password' })
  }
})
