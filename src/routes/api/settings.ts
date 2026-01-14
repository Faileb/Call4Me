import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { testTwilioConnection } from '../../services/twilio.js'

export const settingsRouter = Router()

// Settings keys
const SETTINGS_KEYS = [
  'defaultMachineDetection',
  'defaultMachineDetectionTimeout',
  'defaultPostBeepDelay',
  'twilioAccountSid',
  'twilioAuthToken',
  'twilioPhoneNumber',
] as const

type SettingKey = (typeof SETTINGS_KEYS)[number]

// Validation schema
const updateSettingsSchema = z.object({
  defaultMachineDetection: z
    .enum(['Enable', 'DetectMessageEnd', 'Disabled'])
    .optional(),
  defaultMachineDetectionTimeout: z.number().int().min(2).max(60).optional(),
  defaultPostBeepDelay: z.number().min(0).max(10).optional(),
  // Twilio credentials (optional override)
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioPhoneNumber: z.string().optional(),
})

// Helper to get a setting
async function getSetting(key: SettingKey): Promise<string | null> {
  const setting = await prisma.settings.findUnique({
    where: { key },
  })
  return setting?.value ?? null
}

// Helper to set a setting
async function setSetting(key: SettingKey, value: unknown): Promise<void> {
  await prisma.settings.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  })
}

// Get all settings
settingsRouter.get('/', async (_req, res) => {
  try {
    const settings = await prisma.settings.findMany()

    const result: Record<string, unknown> = {}
    for (const setting of settings) {
      try {
        result[setting.key] = JSON.parse(setting.value)
      } catch {
        result[setting.key] = setting.value
      }
    }

    // Mask sensitive values
    if (result.twilioAuthToken) {
      result.twilioAuthToken = '********'
    }

    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Failed to get settings')
    res.status(500).json({ error: 'Failed to get settings' })
  }
})

// Update settings
settingsRouter.patch('/', async (req, res) => {
  try {
    const validation = updateSettingsSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const updates = validation.data

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && SETTINGS_KEYS.includes(key as SettingKey)) {
        await setSetting(key as SettingKey, value)
      }
    }

    logger.info('Settings updated')

    // Return updated settings (with masked values)
    const settings = await prisma.settings.findMany()
    const result: Record<string, unknown> = {}
    for (const setting of settings) {
      try {
        result[setting.key] = JSON.parse(setting.value)
      } catch {
        result[setting.key] = setting.value
      }
    }
    if (result.twilioAuthToken) {
      result.twilioAuthToken = '********'
    }

    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Failed to update settings')
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

// Test Twilio connection
settingsRouter.post('/test-twilio', async (_req, res) => {
  try {
    const result = await testTwilioConnection()
    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Twilio connection test failed')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    })
  }
})

// Get defaults for scheduled calls
settingsRouter.get('/defaults', async (_req, res) => {
  try {
    const machineDetection = await getSetting('defaultMachineDetection')
    const machineDetectionTimeout = await getSetting('defaultMachineDetectionTimeout')
    const postBeepDelay = await getSetting('defaultPostBeepDelay')

    res.json({
      machineDetection: machineDetection ? JSON.parse(machineDetection) : 'DetectMessageEnd',
      machineDetectionTimeout: machineDetectionTimeout ? JSON.parse(machineDetectionTimeout) : 30,
      postBeepDelay: postBeepDelay ? JSON.parse(postBeepDelay) : 0,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get defaults')
    res.status(500).json({ error: 'Failed to get defaults' })
  }
})

// Get server status including configuration warnings
settingsRouter.get('/status', async (_req, res) => {
  const warnings: string[] = []

  // Check APP_BASE_URL
  const baseUrl = config.appBaseUrl.toLowerCase()
  const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('0.0.0.0')
  const isHttp = baseUrl.startsWith('http://') && !isLocalhost

  if (isLocalhost) {
    warnings.push(
      `APP_BASE_URL is set to "${config.appBaseUrl}" which Twilio cannot reach. ` +
      'Use a tunnel service like ngrok for local development: run "ngrok http 3000" and update APP_BASE_URL to the ngrok URL.'
    )
  } else if (isHttp) {
    warnings.push(
      'APP_BASE_URL uses HTTP instead of HTTPS. Twilio may reject non-HTTPS callback URLs.'
    )
  }

  res.json({
    appBaseUrl: config.appBaseUrl,
    twilioPhoneNumber: config.twilioPhoneNumber,
    isLocalhost,
    warnings,
  })
})
