import { Router, Request, Response } from 'express'
import argon2 from 'argon2'
import Twilio from 'twilio'
import { config, updateConfig, hasRequiredConfig } from '../../config.js'
import { configService } from '../../services/configService.js'
import { logger } from '../../utils/logger.js'
import { checkFfmpeg } from '../../services/audio.js'

export const setupRouter = Router()

// Check setup status - public endpoint
setupRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const isSetupComplete = await configService.isSetupComplete()
    const hasPassword = await configService.hasSecret('passwordHash')
    const hasFfmpeg = await checkFfmpeg()

    res.json({
      initialized: isSetupComplete,
      setupComplete: isSetupComplete,
      hasPassword,
      hasFfmpeg,
      // If setup is complete, also return auth status
      authEnabled: isSetupComplete ? !config.disableAuth && hasPassword : false,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to check setup status')
    res.status(500).json({ error: 'Failed to check setup status' })
  }
})

// Middleware to block setup routes if already set up
function requireSetupMode(req: Request, res: Response, next: Function) {
  if (!config.isSetupMode) {
    return res.status(403).json({
      error: 'Setup already complete. Use the settings page to modify configuration.',
    })
  }
  next()
}

// Test database connection
setupRouter.post('/database', requireSetupMode, async (_req: Request, res: Response) => {
  try {
    // Database is already connected if we got here
    res.json({ success: true, message: 'Database connection successful' })
  } catch (error) {
    logger.error({ error }, 'Database connection test failed')
    res.status(500).json({ success: false, error: 'Database connection failed' })
  }
})

// Configure Twilio credentials
setupRouter.post('/twilio', requireSetupMode, async (req: Request, res: Response) => {
  try {
    const { accountSid, authToken, phoneNumber } = req.body

    if (!accountSid || !authToken || !phoneNumber) {
      return res.status(400).json({
        error: 'Account SID, Auth Token, and Phone Number are required',
      })
    }

    // Validate credentials by calling Twilio API
    try {
      const client = Twilio(accountSid, authToken)
      const account = await client.api.v2010.accounts(accountSid).fetch()

      // Store credentials (encrypted)
      await configService.setSecret('twilioAccountSid', accountSid)
      await configService.setSecret('twilioAuthToken', authToken)
      await configService.setSecret('twilioPhoneNumber', phoneNumber)

      // Update runtime config
      updateConfig({
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioPhoneNumber: phoneNumber,
      })

      res.json({
        success: true,
        accountName: account.friendlyName,
        accountStatus: account.status,
      })
    } catch (twilioError: unknown) {
      const message = twilioError instanceof Error ? twilioError.message : 'Unknown error'
      logger.warn({ error: twilioError }, 'Invalid Twilio credentials')
      res.status(400).json({
        success: false,
        error: `Invalid Twilio credentials: ${message}`,
      })
    }
  } catch (error) {
    logger.error({ error }, 'Failed to configure Twilio')
    res.status(500).json({ error: 'Failed to configure Twilio' })
  }
})

// Configure base URL / tunnel
setupRouter.post('/url', requireSetupMode, async (req: Request, res: Response) => {
  try {
    const { baseUrl, tunnelType } = req.body

    if (!baseUrl) {
      return res.status(400).json({ error: 'Base URL is required' })
    }

    // Validate URL format
    try {
      new URL(baseUrl)
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' })
    }

    // Store in config
    await configService.set('appBaseUrl', baseUrl)
    if (tunnelType) {
      await configService.set('tunnelType', tunnelType)
    }

    // Update runtime config
    updateConfig({ appBaseUrl: baseUrl })

    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to configure URL')
    res.status(500).json({ error: 'Failed to configure URL' })
  }
})

// Set initial password (optional)
setupRouter.post('/password', requireSetupMode, async (req: Request, res: Response) => {
  try {
    const { password, skipPassword } = req.body

    if (skipPassword) {
      // User chose to skip password - enable passwordless mode
      await configService.set('disableAuth', true)
      updateConfig({ disableAuth: true })
      res.json({ success: true, passwordSet: false })
      return
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters',
      })
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
    updateConfig({ disableAuth: false })

    res.json({ success: true, passwordSet: true })
  } catch (error) {
    logger.error({ error }, 'Failed to set password')
    res.status(500).json({ error: 'Failed to set password' })
  }
})

// Complete setup
setupRouter.post('/complete', requireSetupMode, async (_req: Request, res: Response) => {
  try {
    // Verify required configuration is set
    const twilioSid = await configService.getSecret('twilioAccountSid')
    const twilioToken = await configService.getSecret('twilioAuthToken')
    const twilioPhone = await configService.getSecret('twilioPhoneNumber')
    const baseUrl = await configService.get('appBaseUrl')

    const missing: string[] = []
    if (!twilioSid) missing.push('Twilio Account SID')
    if (!twilioToken) missing.push('Twilio Auth Token')
    if (!twilioPhone) missing.push('Twilio Phone Number')
    if (!baseUrl) missing.push('Base URL')

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required configuration: ${missing.join(', ')}`,
      })
    }

    // Mark setup as complete
    await configService.completeSetup()

    // Update runtime config
    updateConfig({ isSetupMode: false })

    logger.info('Setup completed successfully')
    res.json({ success: true, redirectTo: '/' })
  } catch (error) {
    logger.error({ error }, 'Failed to complete setup')
    res.status(500).json({ error: 'Failed to complete setup' })
  }
})

// Get list of Twilio phone numbers for the account (after credentials are set)
setupRouter.get('/twilio/phone-numbers', requireSetupMode, async (_req: Request, res: Response) => {
  try {
    const accountSid = await configService.getSecret('twilioAccountSid')
    const authToken = await configService.getSecret('twilioAuthToken')

    if (!accountSid || !authToken) {
      return res.status(400).json({ error: 'Twilio credentials not configured yet' })
    }

    const client = Twilio(accountSid, authToken)
    const numbers = await client.incomingPhoneNumbers.list({ limit: 20 })

    res.json({
      success: true,
      phoneNumbers: numbers.map((n) => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
      })),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch phone numbers')
    res.status(500).json({ error: 'Failed to fetch phone numbers' })
  }
})

// Check system requirements
setupRouter.get('/prerequisites', async (_req: Request, res: Response) => {
  try {
    const hasFfmpeg = await checkFfmpeg()

    res.json({
      ffmpeg: {
        installed: hasFfmpeg,
        required: false,
        message: hasFfmpeg
          ? 'FFmpeg is installed - audio conversion enabled'
          : 'FFmpeg not found - browser recordings will need to be converted manually',
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to check prerequisites')
    res.status(500).json({ error: 'Failed to check prerequisites' })
  }
})
