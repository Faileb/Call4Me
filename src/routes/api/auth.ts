import { Router } from 'express'
import argon2 from 'argon2'
import rateLimit from 'express-rate-limit'
import { config } from '../../config.js'
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

// Store the password hash (computed on first use)
let passwordHash: string | null = null

async function getPasswordHash(): Promise<string | null> {
  if (passwordHash) return passwordHash

  if (config.appPasswordHash) {
    passwordHash = config.appPasswordHash
    return passwordHash
  }

  if (config.appPassword) {
    passwordHash = await argon2.hash(config.appPassword)
    logger.info('Password hash computed from APP_PASSWORD')
    return passwordHash
  }

  return null
}

// Check session status
authRouter.get('/session', (req, res) => {
  res.json({
    authenticated: !!req.session?.authenticated,
  })
})

// Login
authRouter.post('/login', loginLimiter, async (req, res) => {
  try {
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

    // Update password hash in memory (note: this doesn't persist across restarts)
    // For persistence, we'd need to store in database
    passwordHash = await argon2.hash(newPassword)

    logger.info('Password changed successfully')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Change password error')
    res.status(500).json({ error: 'Failed to change password' })
  }
})
