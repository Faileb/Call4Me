import twilio from 'twilio'
import { config } from '../config.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { callsTotal, callDuration, lastCallTimestamp } from './metrics.js'

// Lazy-initialized Twilio client
let client: ReturnType<typeof twilio> | null = null

function getTwilioClient(): ReturnType<typeof twilio> {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error('Twilio credentials not configured. Complete setup first.')
  }
  if (!client) {
    client = twilio(config.twilioAccountSid, config.twilioAuthToken)
  }
  return client
}

// Reset client (used when credentials change)
export function resetTwilioClient(): void {
  client = null
}

export interface ScheduledCallData {
  id: string | null  // null for ad-hoc/retry calls
  phoneNumber: string
  contactId?: string | null
  recordingId: string
  recording: {
    id: string
    filename: string
  }
  machineDetection: string
  machineDetectionTimeout: number
  postBeepDelay: number
  twilioOptions: string
}

// Check if the base URL is accessible by Twilio
function validateBaseUrl(): { valid: boolean; error?: string } {
  if (!config.appBaseUrl) {
    return {
      valid: false,
      error: 'Base URL not configured. Please set up a public URL in Settings > Network.',
    }
  }
  const url = config.appBaseUrl.toLowerCase()
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) {
    return {
      valid: false,
      error: `Base URL is set to a localhost address (${config.appBaseUrl}). Twilio cannot reach localhost. Please configure a tunnel service in Settings > Network.`,
    }
  }
  return { valid: true }
}

export async function triggerCall(
  callData: ScheduledCallData,
  retryOf?: string
): Promise<{ callLogId: string; twilioSid: string }> {
  const { id, phoneNumber, contactId, recordingId, recording, machineDetection, machineDetectionTimeout, postBeepDelay } = callData

  // Validate base URL before attempting call
  const urlCheck = validateBaseUrl()
  if (!urlCheck.valid) {
    throw new Error(urlCheck.error)
  }

  // Create call log entry
  const callLog = await prisma.callLog.create({
    data: {
      scheduledCallId: id,  // Can be null for ad-hoc/retry calls
      contactId,
      phoneNumber,
      recordingId,
      status: 'initiated',
      retryOf,
    },
  })

  try {
    // Validate phone number is configured
    if (!config.twilioPhoneNumber) {
      throw new Error('Twilio phone number not configured. Complete setup first.')
    }

    // Build TwiML URL (appBaseUrl is validated above)
    const twimlUrl = `${config.appBaseUrl}/api/twilio/twiml/${callLog.id}`
    const statusCallback = `${config.appBaseUrl}/api/twilio/status`

    // Build call options
    const callOptions: Parameters<ReturnType<typeof twilio>['calls']['create']>[0] = {
      to: phoneNumber,
      from: config.twilioPhoneNumber,
      url: twimlUrl,
      statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    }

    // Add AMD options (synchronous mode - Twilio waits for detection before fetching TwiML)
    if (machineDetection !== 'Disabled') {
      callOptions.machineDetection = machineDetection as 'Enable' | 'DetectMessageEnd'
      callOptions.machineDetectionTimeout = machineDetectionTimeout
      // Note: Not using asyncAmd so Twilio waits for detection (including beep) before fetching TwiML.
      // This ensures voicemail messages are played AFTER the greeting ends, not during it.
    }

    // Parse and add additional Twilio options
    const additionalOptions = JSON.parse(callData.twilioOptions || '{}')
    Object.assign(callOptions, additionalOptions)

    // Ensure async AMD is disabled - we need synchronous AMD for voicemail to work properly.
    // Remove any async AMD options that may have been added via twilioOptions.
    delete callOptions.asyncAmd
    delete callOptions.asyncAmdStatusCallback
    delete callOptions.asyncAmdStatusCallbackMethod

    // Store postBeepDelay in call log metadata (we'll use it in TwiML generation)
    // For now, we'll encode it in the TwiML URL
    // Update: storing in separate place

    logger.info({ callLogId: callLog.id, to: phoneNumber }, 'Initiating Twilio call')

    const call = await getTwilioClient().calls.create(callOptions)

    // Update call log with Twilio SID
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: { twilioCallSid: call.sid },
    })

    logger.info(
      { callLogId: callLog.id, twilioSid: call.sid },
      'Twilio call initiated'
    )

    return { callLogId: callLog.id, twilioSid: call.sid }
  } catch (error) {
    // Update call log with error
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        endedAt: new Date(),
      },
    })

    callsTotal.inc({ status: 'failed' })

    logger.error({ error, callLogId: callLog.id }, 'Twilio call failed')
    throw error
  }
}

export async function updateCallStatus(
  callSid: string,
  status: string,
  duration?: number,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  const callLog = await prisma.callLog.findFirst({
    where: { twilioCallSid: callSid },
  })

  if (!callLog) {
    logger.warn({ callSid }, 'Call log not found for status update')
    return
  }

  const updates: Record<string, unknown> = { status }

  if (status === 'in-progress' || status === 'in_progress') {
    updates.answeredAt = new Date()
    updates.status = 'in_progress'
  }

  if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
    updates.endedAt = new Date()
    updates.status = status.replace('-', '_') // Normalize to underscore

    if (duration) {
      updates.duration = duration
      callDuration.observe(duration)
    }

    // Store error details if present
    if (errorCode) {
      updates.errorCode = errorCode
    }
    if (errorMessage) {
      updates.errorMessage = errorMessage
    }

    callsTotal.inc({ status: updates.status as string })
    lastCallTimestamp.set(Date.now() / 1000)
  }

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: updates,
  })

  logger.info(
    { callLogId: callLog.id, status, errorCode, errorMessage },
    'Call status updated'
  )
}

export async function updateAmdResult(
  callSid: string,
  amdResult: string
): Promise<void> {
  const callLog = await prisma.callLog.findFirst({
    where: { twilioCallSid: callSid },
  })

  if (!callLog) {
    logger.warn({ callSid }, 'Call log not found for AMD update')
    return
  }

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: { amdResult },
  })

  logger.info({ callLogId: callLog.id, amdResult }, 'AMD result recorded')
}

export async function testTwilioConnection(): Promise<{
  success: boolean
  accountName?: string
  phoneNumber?: string
  error?: string
}> {
  try {
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      return {
        success: false,
        error: 'Twilio credentials not configured',
      }
    }

    const twilioClient = getTwilioClient()
    const account = await twilioClient.api.accounts(config.twilioAccountSid).fetch()

    // Verify phone number if configured
    if (config.twilioPhoneNumber) {
      const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 20 })
      const hasNumber = numbers.some((n) => n.phoneNumber === config.twilioPhoneNumber)

      if (!hasNumber) {
        // Check if it's a valid number on the account
        try {
          await twilioClient.lookups.v2.phoneNumbers(config.twilioPhoneNumber).fetch()
        } catch {
          return {
            success: false,
            error: `Phone number ${config.twilioPhoneNumber} not found on this account`,
          }
        }
      }
    }

    return {
      success: true,
      accountName: account.friendlyName,
      phoneNumber: config.twilioPhoneNumber ?? undefined,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}

// Generate TwiML for a call
export function generateTwiML(
  audioUrl: string,
  postBeepDelay: number = 0
): string {
  const VoiceResponse = twilio.twiml.VoiceResponse
  const response = new VoiceResponse()

  if (postBeepDelay > 0) {
    response.pause({ length: postBeepDelay })
  }

  response.play(audioUrl)
  response.hangup()

  return response.toString()
}
