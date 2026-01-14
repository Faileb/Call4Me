import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { config, updateConfig } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { testTwilioConnection } from '../../services/twilio.js'
import { checkFfmpeg } from '../../services/audio.js'
import { configService } from '../../services/configService.js'

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

    // Get Twilio credentials from encrypted store (or fall back to runtime config)
    const twilioSid = await configService.getSecret('twilioAccountSid')
    const twilioPhone = await configService.getSecret('twilioPhoneNumber')

    result.twilioAccountSid = twilioSid || config.twilioAccountSid
    result.twilioPhoneNumber = twilioPhone || config.twilioPhoneNumber
    result.twilioAuthToken = '********' // Always mask auth token

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

    // Handle Twilio credentials separately (store encrypted)
    if (updates.twilioAccountSid) {
      await configService.setSecret('twilioAccountSid', updates.twilioAccountSid)
      updateConfig({ twilioAccountSid: updates.twilioAccountSid })
    }
    if (updates.twilioAuthToken) {
      await configService.setSecret('twilioAuthToken', updates.twilioAuthToken)
      updateConfig({ twilioAuthToken: updates.twilioAuthToken })
    }
    if (updates.twilioPhoneNumber) {
      await configService.setSecret('twilioPhoneNumber', updates.twilioPhoneNumber)
      updateConfig({ twilioPhoneNumber: updates.twilioPhoneNumber })
    }

    // Handle other settings (store in regular settings table)
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && !key.startsWith('twilio') && SETTINGS_KEYS.includes(key as SettingKey)) {
        await setSetting(key as SettingKey, value)
      }
    }

    logger.info('Settings updated')

    // Return updated settings
    const twilioSid = await configService.getSecret('twilioAccountSid')
    const twilioPhone = await configService.getSecret('twilioPhoneNumber')

    const settings = await prisma.settings.findMany()
    const result: Record<string, unknown> = {}
    for (const setting of settings) {
      try {
        result[setting.key] = JSON.parse(setting.value)
      } catch {
        result[setting.key] = setting.value
      }
    }

    // Add Twilio values (auth token masked)
    result.twilioAccountSid = twilioSid || config.twilioAccountSid
    result.twilioPhoneNumber = twilioPhone || config.twilioPhoneNumber
    result.twilioAuthToken = '********'

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
  let isLocalhost = false
  let isHttp = false

  if (config.appBaseUrl) {
    const baseUrl = config.appBaseUrl.toLowerCase()
    isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('0.0.0.0')
    isHttp = baseUrl.startsWith('http://') && !isLocalhost

    if (isLocalhost) {
      warnings.push(
        `Base URL is set to "${config.appBaseUrl}" which Twilio cannot reach. ` +
        'Configure a tunnel service in Settings > Network, or use ngrok.'
      )
    } else if (isHttp) {
      warnings.push(
        'Base URL uses HTTP instead of HTTPS. Twilio may reject non-HTTPS callback URLs.'
      )
    }
  } else {
    warnings.push(
      'No base URL configured. Twilio webhooks will not work until a public URL is set.'
    )
  }

  // Check FFmpeg availability
  const hasFfmpeg = await checkFfmpeg()
  if (!hasFfmpeg) {
    warnings.push(
      'FFmpeg is not installed. Browser recordings (WebM format) will not work. ' +
      'Install FFmpeg to enable audio conversion, or upload MP3/WAV files directly.'
    )
  }

  res.json({
    appBaseUrl: config.appBaseUrl,
    twilioPhoneNumber: config.twilioPhoneNumber,
    isLocalhost,
    hasFfmpeg,
    warnings,
    isSetupMode: config.isSetupMode,
  })
})
