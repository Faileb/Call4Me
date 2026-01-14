import twilio from 'twilio'
import { config } from '../config.js'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { callsTotal, callDuration, lastCallTimestamp } from './metrics.js'

// Initialize Twilio client
const client = twilio(config.twilioAccountSid, config.twilioAuthToken)

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
  const url = config.appBaseUrl.toLowerCase()
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) {
    return {
      valid: false,
      error: `APP_BASE_URL is set to a localhost address (${config.appBaseUrl}). Twilio cannot reach localhost. Please use a tunnel like ngrok and update APP_BASE_URL to the public URL.`,
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
    // Build TwiML URL
    const twimlUrl = `${config.appBaseUrl}/api/twilio/twiml/${callLog.id}`
    const statusCallback = `${config.appBaseUrl}/api/twilio/status`
    const amdCallback = `${config.appBaseUrl}/api/twilio/amd`

    // Build call options
    const callOptions: twilio.Twilio.Api.V2010.AccountContext.CallListInstanceCreateOptions = {
      to: phoneNumber,
      from: config.twilioPhoneNumber,
      url: twimlUrl,
      statusCallback,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    }

    // Add AMD options
    if (machineDetection !== 'Disabled') {
      callOptions.machineDetection = machineDetection as 'Enable' | 'DetectMessageEnd'
      callOptions.machineDetectionTimeout = machineDetectionTimeout
      callOptions.asyncAmd = true
      callOptions.asyncAmdStatusCallback = amdCallback
      callOptions.asyncAmdStatusCallbackMethod = 'POST'
    }

    // Parse and add additional Twilio options
    const additionalOptions = JSON.parse(callData.twilioOptions || '{}')
    Object.assign(callOptions, additionalOptions)

    // Store postBeepDelay in call log metadata (we'll use it in TwiML generation)
    // For now, we'll encode it in the TwiML URL
    // Update: storing in separate place

    logger.info({ callLogId: callLog.id, to: phoneNumber }, 'Initiating Twilio call')

    const call = await client.calls.create(callOptions)

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
    const account = await client.api.accounts(config.twilioAccountSid).fetch()

    // Verify phone number
    const numbers = await client.incomingPhoneNumbers.list({ limit: 1 })
    const hasNumber = numbers.some((n) => n.phoneNumber === config.twilioPhoneNumber)

    if (!hasNumber) {
      // Check if it's a valid number on the account
      try {
        await client.lookups.v2.phoneNumbers(config.twilioPhoneNumber).fetch()
      } catch {
        return {
          success: false,
          error: `Phone number ${config.twilioPhoneNumber} not found on this account`,
        }
      }
    }

    return {
      success: true,
      accountName: account.friendlyName,
      phoneNumber: config.twilioPhoneNumber,
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
