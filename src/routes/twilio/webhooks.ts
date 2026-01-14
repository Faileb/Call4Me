import { Router } from 'express'
import path from 'path'
import fs from 'fs/promises'
import { prisma } from '../../db/client.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { updateCallStatus, updateAmdResult, generateTwiML } from '../../services/twilio.js'

export const twilioWebhooksRouter = Router()

// Parse URL-encoded bodies from Twilio
twilioWebhooksRouter.use((req, res, next) => {
  // Twilio sends application/x-www-form-urlencoded
  if (req.is('application/x-www-form-urlencoded')) {
    return next()
  }
  next()
})

// Call status callback
twilioWebhooksRouter.post('/status', async (req, res) => {
  try {
    const {
      CallSid,
      CallStatus,
      CallDuration,
      ErrorCode,
      ErrorMessage,
      SipResponseCode,
      // Additional useful fields
      From,
      To,
      Direction,
      Timestamp,
    } = req.body

    logger.info({
      callSid: CallSid,
      status: CallStatus,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
      sipCode: SipResponseCode,
      from: From,
      to: To,
    }, 'Received call status webhook')

    // Log the full payload for debugging
    logger.debug({ payload: req.body }, 'Full Twilio status payload')

    await updateCallStatus(
      CallSid,
      CallStatus,
      CallDuration ? parseInt(CallDuration, 10) : undefined,
      ErrorCode,
      ErrorMessage
    )

    res.status(200).send('OK')
  } catch (error) {
    logger.error({ error }, 'Error processing status webhook')
    res.status(500).send('Error')
  }
})

// AMD (Answering Machine Detection) callback
// NOTE: With synchronous AMD, this endpoint is no longer used for new calls.
// AMD results are now included in the TwiML request and processed there.
// Kept for backwards compatibility with any in-flight calls during deployment.
twilioWebhooksRouter.post('/amd', async (req, res) => {
  try {
    const { CallSid, AnsweredBy } = req.body

    logger.info({ callSid: CallSid, answeredBy: AnsweredBy }, 'Received AMD webhook')

    // Map Twilio AMD results to our format
    const amdResult = mapAmdResult(AnsweredBy)
    await updateAmdResult(CallSid, amdResult)

    res.status(200).send('OK')
  } catch (error) {
    logger.error({ error }, 'Error processing AMD webhook')
    res.status(500).send('Error')
  }
})

// TwiML endpoint for calls
twilioWebhooksRouter.all('/twiml/:callLogId', async (req, res) => {
  try {
    const { callLogId } = req.params
    // With synchronous AMD, Twilio includes AnsweredBy in the TwiML request
    const answeredBy = req.body.AnsweredBy || req.query.AnsweredBy

    // Get call log to find the recording and settings
    const callLog = await prisma.callLog.findUnique({
      where: { id: callLogId },
      include: {
        recording: true,
        scheduledCall: true,
      },
    })

    if (!callLog) {
      logger.warn({ callLogId }, 'Call log not found for TwiML request')
      res.status(404).send('Not found')
      return
    }

    // Store AMD result if provided (from synchronous machine detection)
    if (answeredBy) {
      const amdResult = mapAmdResult(answeredBy)
      await prisma.callLog.update({
        where: { id: callLogId },
        data: { amdResult },
      })
      logger.info({ callLogId, answeredBy, amdResult }, 'AMD result recorded from TwiML request')
    }

    // Build audio URL - use the public Twilio endpoint (no auth required)
    const audioUrl = `${config.appBaseUrl}/api/twilio/audio/${callLog.recording.id}`

    // Get post-beep delay
    const postBeepDelay = callLog.scheduledCall?.postBeepDelay ?? 0

    // Generate TwiML
    const twiml = generateTwiML(audioUrl, postBeepDelay)

    logger.info({ callLogId, postBeepDelay, answeredBy }, 'Serving TwiML')

    res.type('text/xml')
    res.send(twiml)
  } catch (error) {
    logger.error({ error }, 'Error generating TwiML')
    res.status(500).send('Error')
  }
})

// Public audio endpoint for Twilio to access recordings
twilioWebhooksRouter.get('/audio/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params

    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
    })

    if (!recording) {
      logger.warn({ recordingId }, 'Recording not found for Twilio audio request')
      return res.status(404).send('Not found')
    }

    const filePath = path.join(config.recordingsPath, recording.filename)

    // Check if file exists
    try {
      await fs.access(filePath)
    } catch {
      logger.warn({ recordingId, filePath }, 'Recording file not found on disk')
      return res.status(404).send('File not found')
    }

    res.setHeader('Content-Type', recording.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${recording.originalFilename}"`)

    const fileHandle = await fs.open(filePath, 'r')
    const stream = fileHandle.createReadStream()
    stream.pipe(res)

    logger.info({ recordingId }, 'Serving audio to Twilio')
  } catch (error) {
    logger.error({ error }, 'Error serving audio to Twilio')
    res.status(500).send('Error')
  }
})

// Helper to map Twilio AMD results to our format
function mapAmdResult(answeredBy: string): string {
  const mapping: Record<string, string> = {
    human: 'human',
    machine_start: 'machine_start',
    machine_end_beep: 'machine_end_beep',
    machine_end_silence: 'machine_end_silence',
    machine_end_other: 'machine_end_other',
    fax: 'fax',
    unknown: 'unknown',
  }

  return mapping[answeredBy] || 'unknown'
}
