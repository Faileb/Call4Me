import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { logger } from '../../utils/logger.js'
import { scheduleCall, cancelScheduledJob } from '../../services/scheduler.js'
import { triggerCall } from '../../services/twilio.js'
import { callsScheduled } from '../../services/metrics.js'

export const callsRouter = Router()

// Validation schemas
const createScheduledCallSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format'),
  contactId: z.string().uuid().nullable().optional(),
  recordingId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  recurrencePattern: z.string().nullable().optional(),
  recurrenceEnabled: z.boolean().default(false),
  machineDetection: z.enum(['Enable', 'DetectMessageEnd', 'Disabled']).default('DetectMessageEnd'),
  machineDetectionTimeout: z.number().int().min(2).max(60).default(30),
  postBeepDelay: z.number().min(0).max(10).default(0),
  twilioOptions: z.record(z.unknown()).default({}),
  triggerImmediately: z.boolean().default(false),  // Call now instead of waiting
})

const updateScheduledCallSchema = createScheduledCallSchema.partial()

// ============ Scheduled Calls ============

// List scheduled calls
callsRouter.get('/scheduled', async (_req, res) => {
  try {
    const calls = await prisma.scheduledCall.findMany({
      include: {
        recording: {
          select: { id: true, name: true },
        },
        contact: {
          select: { id: true, name: true, phoneNumber: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    })

    const result = calls.map((c) => ({
      ...c,
      twilioOptions: JSON.parse(c.twilioOptions),
    }))

    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Failed to list scheduled calls')
    res.status(500).json({ error: 'Failed to list scheduled calls' })
  }
})

// Get single scheduled call
callsRouter.get('/scheduled/:id', async (req, res) => {
  try {
    const call = await prisma.scheduledCall.findUnique({
      where: { id: req.params.id },
      include: {
        recording: {
          select: { id: true, name: true },
        },
        contact: {
          select: { id: true, name: true, phoneNumber: true },
        },
      },
    })

    if (!call) {
      return res.status(404).json({ error: 'Scheduled call not found' })
    }

    res.json({
      ...call,
      twilioOptions: JSON.parse(call.twilioOptions),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get scheduled call')
    res.status(500).json({ error: 'Failed to get scheduled call' })
  }
})

// Create scheduled call
callsRouter.post('/scheduled', async (req, res) => {
  try {
    const validation = createScheduledCallSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const { twilioOptions, scheduledAt, triggerImmediately, ...rest } = validation.data

    const call = await prisma.scheduledCall.create({
      data: {
        ...rest,
        scheduledAt: new Date(scheduledAt),
        nextRunAt: new Date(scheduledAt),
        twilioOptions: JSON.stringify(twilioOptions),
        status: triggerImmediately && !rest.recurrenceEnabled ? 'completed' : 'pending',
      },
      include: {
        recording: true,
        contact: {
          select: { id: true, name: true, phoneNumber: true },
        },
      },
    })

    let callResult = null

    if (triggerImmediately) {
      // Trigger the call immediately
      const callData = {
        id: call.id,
        phoneNumber: call.phoneNumber,
        contactId: call.contactId,
        recordingId: call.recordingId,
        recording: {
          id: call.recording.id,
          filename: call.recording.filename,
        },
        machineDetection: call.machineDetection,
        machineDetectionTimeout: call.machineDetectionTimeout,
        postBeepDelay: call.postBeepDelay,
        twilioOptions: call.twilioOptions,
      }

      callResult = await triggerCall(callData)

      // Update lastRunAt
      await prisma.scheduledCall.update({
        where: { id: call.id },
        data: { lastRunAt: new Date() },
      })

      logger.info({ callId: call.id }, 'Call triggered immediately')
    }

    // Schedule the job only if not triggered immediately, or if it's recurring
    if (!triggerImmediately || rest.recurrenceEnabled) {
      await scheduleCall(call)
    }

    // Update metrics
    const count = await prisma.scheduledCall.count({
      where: { status: 'pending' },
    })
    callsScheduled.set(count)

    logger.info({ callId: call.id, triggerImmediately }, 'Scheduled call created')
    res.status(201).json({
      ...call,
      recording: { id: call.recording.id, name: call.recording.name },
      twilioOptions: JSON.parse(call.twilioOptions),
      callResult,  // Include the call result if triggered immediately
    })
  } catch (error) {
    logger.error({ error }, 'Failed to create scheduled call')
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create scheduled call' })
  }
})

// Update scheduled call
callsRouter.patch('/scheduled/:id', async (req, res) => {
  try {
    const validation = updateScheduledCallSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const { twilioOptions, scheduledAt, ...rest } = validation.data

    // Cancel existing job
    cancelScheduledJob(req.params.id)

    const call = await prisma.scheduledCall.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt), nextRunAt: new Date(scheduledAt) }),
        ...(twilioOptions !== undefined && { twilioOptions: JSON.stringify(twilioOptions) }),
      },
      include: {
        recording: {
          select: { id: true, name: true },
        },
        contact: {
          select: { id: true, name: true, phoneNumber: true },
        },
      },
    })

    // Re-schedule if still pending
    if (call.status === 'pending') {
      await scheduleCall(call)
    }

    logger.info({ callId: call.id }, 'Scheduled call updated')
    res.json({
      ...call,
      twilioOptions: JSON.parse(call.twilioOptions),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to update scheduled call')
    res.status(500).json({ error: 'Failed to update scheduled call' })
  }
})

// Delete scheduled call
callsRouter.delete('/scheduled/:id', async (req, res) => {
  try {
    // Cancel the job
    cancelScheduledJob(req.params.id)

    await prisma.scheduledCall.delete({
      where: { id: req.params.id },
    })

    // Update metrics
    const count = await prisma.scheduledCall.count({
      where: { status: 'pending' },
    })
    callsScheduled.set(count)

    logger.info({ callId: req.params.id }, 'Scheduled call deleted')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to delete scheduled call')
    res.status(500).json({ error: 'Failed to delete scheduled call' })
  }
})

// Pause recurring call
callsRouter.post('/scheduled/:id/pause', async (req, res) => {
  try {
    cancelScheduledJob(req.params.id)

    const call = await prisma.scheduledCall.update({
      where: { id: req.params.id },
      data: { status: 'paused' },
    })

    logger.info({ callId: call.id }, 'Scheduled call paused')
    res.json(call)
  } catch (error) {
    logger.error({ error }, 'Failed to pause scheduled call')
    res.status(500).json({ error: 'Failed to pause scheduled call' })
  }
})

// Resume recurring call
callsRouter.post('/scheduled/:id/resume', async (req, res) => {
  try {
    const call = await prisma.scheduledCall.update({
      where: { id: req.params.id },
      data: { status: 'pending' },
      include: {
        recording: true,
        contact: true,
      },
    })

    await scheduleCall(call)

    logger.info({ callId: call.id }, 'Scheduled call resumed')
    res.json(call)
  } catch (error) {
    logger.error({ error }, 'Failed to resume scheduled call')
    res.status(500).json({ error: 'Failed to resume scheduled call' })
  }
})

// Trigger call immediately
callsRouter.post('/scheduled/:id/trigger', async (req, res) => {
  try {
    const call = await prisma.scheduledCall.findUnique({
      where: { id: req.params.id },
      include: {
        recording: true,
      },
    })

    if (!call) {
      return res.status(404).json({ error: 'Scheduled call not found' })
    }

    // Cancel the scheduled job so it doesn't run again at the original time
    cancelScheduledJob(call.id)

    // Build proper call data
    const callData = {
      id: call.id,
      phoneNumber: call.phoneNumber,
      contactId: call.contactId,
      recordingId: call.recordingId,
      recording: {
        id: call.recording.id,
        filename: call.recording.filename,
      },
      machineDetection: call.machineDetection,
      machineDetectionTimeout: call.machineDetectionTimeout,
      postBeepDelay: call.postBeepDelay,
      twilioOptions: call.twilioOptions,
    }

    // Trigger the call
    const result = await triggerCall(callData)

    // Update the scheduled call status if it's not recurring
    if (!call.recurrenceEnabled) {
      await prisma.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: 'completed',
          lastRunAt: new Date(),
        },
      })
    } else {
      // For recurring calls, update lastRunAt but keep pending
      await prisma.scheduledCall.update({
        where: { id: call.id },
        data: {
          lastRunAt: new Date(),
        },
      })
      // Re-schedule for the next occurrence
      await scheduleCall({
        ...call,
        twilioOptions: JSON.parse(call.twilioOptions),
      })
    }

    logger.info({ callId: call.id }, 'Call triggered manually')
    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Failed to trigger call')
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to trigger call' })
  }
})

// ============ Call History ============

// List call history
callsRouter.get('/history', async (req, res) => {
  try {
    const { status, from, to, phone, page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (from || to) {
      where.initiatedAt = {}
      if (from) (where.initiatedAt as Record<string, Date>).gte = new Date(from as string)
      if (to) (where.initiatedAt as Record<string, Date>).lte = new Date(to as string)
    }

    if (phone) {
      where.phoneNumber = { contains: phone }
    }

    const [calls, total] = await Promise.all([
      prisma.callLog.findMany({
        where,
        include: {
          recording: {
            select: { id: true, name: true },
          },
          contact: {
            select: { id: true, name: true },
          },
        },
        orderBy: { initiatedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.callLog.count({ where }),
    ])

    res.json({
      data: calls,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to list call history')
    res.status(500).json({ error: 'Failed to list call history' })
  }
})

// Get single call log
callsRouter.get('/history/:id', async (req, res) => {
  try {
    const log = await prisma.callLog.findUnique({
      where: { id: req.params.id },
      include: {
        recording: {
          select: { id: true, name: true },
        },
        contact: {
          select: { id: true, name: true, phoneNumber: true },
        },
        scheduledCall: {
          select: { id: true },
        },
      },
    })

    if (!log) {
      return res.status(404).json({ error: 'Call log not found' })
    }

    res.json(log)
  } catch (error) {
    logger.error({ error }, 'Failed to get call log')
    res.status(500).json({ error: 'Failed to get call log' })
  }
})

// Retry failed call
callsRouter.post('/history/:id/retry', async (req, res) => {
  try {
    const original = await prisma.callLog.findUnique({
      where: { id: req.params.id },
      include: {
        recording: true,
        scheduledCall: true,
      },
    })

    if (!original) {
      return res.status(404).json({ error: 'Call log not found' })
    }

    if (!['failed', 'busy', 'no_answer'].includes(original.status)) {
      return res.status(400).json({ error: 'Can only retry failed calls' })
    }

    if (!original.recording) {
      return res.status(400).json({ error: 'Original recording not found' })
    }

    // Create call data for retry - use scheduledCallId if it exists, otherwise null
    const callData: Parameters<typeof triggerCall>[0] = {
      id: original.scheduledCallId, // null for ad-hoc retries
      phoneNumber: original.phoneNumber,
      contactId: original.contactId,
      recordingId: original.recordingId,
      recording: {
        id: original.recording.id,
        filename: original.recording.filename,
      },
      machineDetection: original.scheduledCall?.machineDetection || 'DetectMessageEnd',
      machineDetectionTimeout: original.scheduledCall?.machineDetectionTimeout || 30,
      postBeepDelay: original.scheduledCall?.postBeepDelay || 0,
      twilioOptions: original.scheduledCall?.twilioOptions || '{}',
    }

    const result = await triggerCall(callData, original.id)

    logger.info({ originalId: original.id, newCallLogId: result.callLogId }, 'Call retried')
    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Failed to retry call')
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to retry call' })
  }
})

// Export call history as CSV
callsRouter.get('/history/export', async (req, res) => {
  try {
    const { status, from, to, phone } = req.query

    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (from || to) {
      where.initiatedAt = {}
      if (from) (where.initiatedAt as Record<string, Date>).gte = new Date(from as string)
      if (to) (where.initiatedAt as Record<string, Date>).lte = new Date(to as string)
    }
    if (phone) where.phoneNumber = { contains: phone }

    const calls = await prisma.callLog.findMany({
      where,
      include: {
        recording: { select: { name: true } },
        contact: { select: { name: true } },
      },
      orderBy: { initiatedAt: 'desc' },
    })

    // Generate CSV
    const headers = [
      'ID',
      'Phone Number',
      'Contact',
      'Recording',
      'Status',
      'AMD Result',
      'Duration',
      'Initiated At',
      'Error',
    ]
    const rows = calls.map((c) => [
      c.id,
      c.phoneNumber,
      c.contact?.name || '',
      c.recording?.name || '',
      c.status,
      c.amdResult || '',
      c.duration?.toString() || '',
      c.initiatedAt.toISOString(),
      c.errorMessage || '',
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n')

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="call-history.csv"')
    res.send(csv)
  } catch (error) {
    logger.error({ error }, 'Failed to export call history')
    res.status(500).json({ error: 'Failed to export call history' })
  }
})
