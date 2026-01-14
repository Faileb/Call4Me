import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { v4 as uuid } from 'uuid'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { recordingsTotal } from '../../services/metrics.js'
import { ACCEPTED_UPLOAD_FORMATS, processAudioFile, checkFfmpeg } from '../../services/audio.js'

export const recordingsRouter = Router()

// Ensure recordings directory exists
async function ensureRecordingsDir() {
  await fs.mkdir(config.recordingsPath, { recursive: true })
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureRecordingsDir()
    cb(null, config.recordingsPath)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuid()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_UPLOAD_FORMATS.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: MP3, WAV, OGG, M4A, WebM`))
    }
  },
})

// Validation schemas
const updateRecordingSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string()).optional(),
})

// List all recordings
recordingsRouter.get('/', async (_req, res) => {
  try {
    const recordings = await prisma.recording.findMany({
      orderBy: { createdAt: 'desc' },
    })

    // Parse tags from JSON string
    const result = recordings.map((r) => ({
      ...r,
      tags: JSON.parse(r.tags),
    }))

    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Failed to list recordings')
    res.status(500).json({ error: 'Failed to list recordings' })
  }
})

// Get single recording
recordingsRouter.get('/:id', async (req, res) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id },
    })

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    res.json({
      ...recording,
      tags: JSON.parse(recording.tags),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get recording')
    res.status(500).json({ error: 'Failed to get recording' })
  }
})

// Upload recording
recordingsRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const { name, description, tags } = req.body
    const originalFilePath = path.join(config.recordingsPath, req.file.filename)

    // Process and convert audio if needed (e.g., WebM -> WAV)
    const processed = await processAudioFile(
      originalFilePath,
      req.file.mimetype,
      config.recordingsPath
    )

    // Get file size after conversion
    const stats = await fs.stat(processed.path)

    const recording = await prisma.recording.create({
      data: {
        name: name || req.file.originalname.replace(/\.[^.]+$/, ''),
        description: description || null,
        tags: JSON.stringify(tags ? JSON.parse(tags) : []),
        filename: processed.filename,
        originalFilename: req.file.originalname,
        mimeType: processed.mimeType,
        duration: processed.duration,
        size: stats.size,
      },
    })

    // Update metrics
    const count = await prisma.recording.count()
    recordingsTotal.set(count)

    logger.info({ recordingId: recording.id, converted: processed.mimeType !== req.file.mimetype }, 'Recording uploaded')
    res.status(201).json({
      ...recording,
      tags: JSON.parse(recording.tags),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to upload recording')
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload recording' })
  }
})

// Save browser recording
recordingsRouter.post('/record', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio data' })
    }

    const { name, description, tags } = req.body
    const originalFilePath = path.join(config.recordingsPath, req.file.filename)

    // Process and convert audio (browser recordings are WebM, need conversion to WAV)
    const processed = await processAudioFile(
      originalFilePath,
      req.file.mimetype,
      config.recordingsPath
    )

    // Get file size after conversion
    const stats = await fs.stat(processed.path)

    const recording = await prisma.recording.create({
      data: {
        name: name || `Recording ${new Date().toLocaleString()}`,
        description: description || null,
        tags: JSON.stringify(tags ? JSON.parse(tags) : []),
        filename: processed.filename,
        originalFilename: 'browser-recording.wav',
        mimeType: processed.mimeType,
        duration: processed.duration,
        size: stats.size,
      },
    })

    // Update metrics
    const count = await prisma.recording.count()
    recordingsTotal.set(count)

    logger.info({ recordingId: recording.id }, 'Browser recording saved and converted')
    res.status(201).json({
      ...recording,
      tags: JSON.parse(recording.tags),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to save browser recording')
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save recording' })
  }
})

// Update recording metadata
recordingsRouter.patch('/:id', async (req, res) => {
  try {
    const validation = updateRecordingSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const { name, description, tags } = validation.data

    const recording = await prisma.recording.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      },
    })

    logger.info({ recordingId: recording.id }, 'Recording updated')
    res.json({
      ...recording,
      tags: JSON.parse(recording.tags),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to update recording')
    res.status(500).json({ error: 'Failed to update recording' })
  }
})

// Delete recording
recordingsRouter.delete('/:id', async (req, res) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id },
    })

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    // Delete file from disk
    const filePath = path.join(config.recordingsPath, recording.filename)
    try {
      await fs.unlink(filePath)
    } catch (err) {
      logger.warn({ err, filePath }, 'Failed to delete recording file')
    }

    // Delete from database
    await prisma.recording.delete({
      where: { id: req.params.id },
    })

    // Update metrics
    const count = await prisma.recording.count()
    recordingsTotal.set(count)

    logger.info({ recordingId: req.params.id }, 'Recording deleted')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to delete recording')
    res.status(500).json({ error: 'Failed to delete recording' })
  }
})

// Stream audio file
recordingsRouter.get('/:id/audio', async (req, res) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id },
    })

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' })
    }

    const filePath = path.join(config.recordingsPath, recording.filename)

    res.setHeader('Content-Type', recording.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${recording.originalFilename}"`)

    const fileStream = await fs.open(filePath, 'r')
    const stream = fileStream.createReadStream()
    stream.pipe(res)
  } catch (error) {
    logger.error({ error }, 'Failed to stream audio')
    res.status(500).json({ error: 'Failed to stream audio' })
  }
})
