import cron from 'node-cron'
import { prisma } from '../db/client.js'
import { logger } from '../utils/logger.js'
import { triggerCall, type ScheduledCallData } from './twilio.js'
import { callsScheduled } from './metrics.js'

// Store scheduled jobs by call ID
const scheduledJobs = new Map<string, cron.ScheduledTask | NodeJS.Timeout>()

// Helper to calculate next run time from cron pattern
function getNextCronDate(pattern: string): Date | null {
  try {
    const task = cron.schedule(pattern, () => {}, { scheduled: false })
    // node-cron doesn't expose next run directly, so we'll calculate manually
    // For now, just return current time + appropriate interval
    // This is a simplified implementation
    return new Date()
  } catch {
    return null
  }
}

export async function scheduleCall(
  call: ScheduledCallData & {
    scheduledAt: Date
    nextRunAt: Date | null
    recurrencePattern: string | null
    recurrenceEnabled: boolean
  }
): Promise<void> {
  const { id, scheduledAt, recurrencePattern, recurrenceEnabled } = call

  // Cancel any existing job for this call
  cancelScheduledJob(id)

  if (recurrenceEnabled && recurrencePattern) {
    // Schedule recurring job using cron
    try {
      const task = cron.schedule(recurrencePattern, async () => {
        logger.info({ callId: id }, 'Executing recurring scheduled call')
        await executeScheduledCall(call)
      })

      scheduledJobs.set(id, task)
      logger.info({ callId: id, pattern: recurrencePattern }, 'Recurring call scheduled')
    } catch (error) {
      logger.error({ error, callId: id }, 'Failed to schedule recurring call')
    }
  } else {
    // Schedule one-time job using setTimeout
    const now = new Date()
    const delay = scheduledAt.getTime() - now.getTime()

    if (delay <= 0) {
      // Time has passed, execute immediately
      logger.info({ callId: id }, 'Scheduled time passed, executing immediately')
      await executeScheduledCall(call)
      return
    }

    const timeout = setTimeout(async () => {
      logger.info({ callId: id }, 'Executing one-time scheduled call')
      await executeScheduledCall(call)
      scheduledJobs.delete(id)
    }, delay)

    scheduledJobs.set(id, timeout)
    logger.info({ callId: id, scheduledAt }, 'One-time call scheduled')
  }
}

async function executeScheduledCall(call: ScheduledCallData & {
  recurrencePattern: string | null
  recurrenceEnabled: boolean
}): Promise<void> {
  try {
    // Update status to in_progress
    await prisma.scheduledCall.update({
      where: { id: call.id },
      data: {
        status: 'in_progress',
        lastRunAt: new Date(),
      },
    })

    // Trigger the call
    await triggerCall(call)

    // Update status based on recurrence
    if (call.recurrenceEnabled && call.recurrencePattern) {
      // Keep as pending for next run
      const nextRun = getNextCronDate(call.recurrencePattern)
      await prisma.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: 'pending',
          nextRunAt: nextRun,
        },
      })
    } else {
      // One-time call completed
      await prisma.scheduledCall.update({
        where: { id: call.id },
        data: {
          status: 'completed',
          nextRunAt: null,
        },
      })
    }

    // Update metrics
    const count = await prisma.scheduledCall.count({
      where: { status: 'pending' },
    })
    callsScheduled.set(count)
  } catch (error) {
    logger.error({ error, callId: call.id }, 'Failed to execute scheduled call')

    // Update status to failed
    await prisma.scheduledCall.update({
      where: { id: call.id },
      data: { status: 'failed' },
    })
  }
}

export function cancelScheduledJob(callId: string): void {
  const job = scheduledJobs.get(callId)
  if (job) {
    if ('stop' in job) {
      // It's a cron task
      job.stop()
    } else {
      // It's a timeout
      clearTimeout(job)
    }
    scheduledJobs.delete(callId)
    logger.info({ callId }, 'Scheduled job cancelled')
  }
}

// Initialize scheduler on startup - restore pending jobs
export async function initScheduler(): Promise<void> {
  // Get all pending scheduled calls
  const pendingCalls = await prisma.scheduledCall.findMany({
    where: {
      status: 'pending',
    },
    include: {
      recording: true,
    },
  })

  logger.info({ count: pendingCalls.length }, 'Restoring pending scheduled calls')

  for (const call of pendingCalls) {
    const callData: ScheduledCallData & {
      scheduledAt: Date
      nextRunAt: Date | null
      recurrencePattern: string | null
      recurrenceEnabled: boolean
    } = {
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
      scheduledAt: call.scheduledAt,
      nextRunAt: call.nextRunAt,
      recurrencePattern: call.recurrencePattern,
      recurrenceEnabled: call.recurrenceEnabled,
    }

    await scheduleCall(callData)
  }

  // Update metrics
  callsScheduled.set(pendingCalls.length)
}
