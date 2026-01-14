import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { logger } from '../../utils/logger.js'

export const templatesRouter = Router()

// Validation schemas
const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
  recordingId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  machineDetection: z.enum(['Enable', 'DetectMessageEnd', 'Disabled']).default('DetectMessageEnd'),
  machineDetectionTimeout: z.number().int().min(2).max(60).default(30),
  postBeepDelay: z.number().min(0).max(10).default(0),
  twilioOptions: z.record(z.unknown()).default({}),
})

const updateTemplateSchema = createTemplateSchema.partial()

// List all templates
templatesRouter.get('/', async (_req, res) => {
  try {
    const templates = await prisma.callTemplate.findMany({
      include: {
        recording: {
          select: { id: true, name: true },
        },
        contact: {
          select: { id: true, name: true, phoneNumber: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const result = templates.map((t) => ({
      ...t,
      twilioOptions: JSON.parse(t.twilioOptions),
    }))

    res.json(result)
  } catch (error) {
    logger.error({ error }, 'Failed to list templates')
    res.status(500).json({ error: 'Failed to list templates' })
  }
})

// Get single template
templatesRouter.get('/:id', async (req, res) => {
  try {
    const template = await prisma.callTemplate.findUnique({
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

    if (!template) {
      return res.status(404).json({ error: 'Template not found' })
    }

    res.json({
      ...template,
      twilioOptions: JSON.parse(template.twilioOptions),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get template')
    res.status(500).json({ error: 'Failed to get template' })
  }
})

// Create template
templatesRouter.post('/', async (req, res) => {
  try {
    const validation = createTemplateSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const { twilioOptions, ...rest } = validation.data

    const template = await prisma.callTemplate.create({
      data: {
        ...rest,
        twilioOptions: JSON.stringify(twilioOptions),
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

    logger.info({ templateId: template.id }, 'Template created')
    res.status(201).json({
      ...template,
      twilioOptions: JSON.parse(template.twilioOptions),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to create template')
    res.status(500).json({ error: 'Failed to create template' })
  }
})

// Update template
templatesRouter.patch('/:id', async (req, res) => {
  try {
    const validation = updateTemplateSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const { twilioOptions, ...rest } = validation.data

    const template = await prisma.callTemplate.update({
      where: { id: req.params.id },
      data: {
        ...rest,
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

    logger.info({ templateId: template.id }, 'Template updated')
    res.json({
      ...template,
      twilioOptions: JSON.parse(template.twilioOptions),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to update template')
    res.status(500).json({ error: 'Failed to update template' })
  }
})

// Delete template
templatesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.callTemplate.delete({
      where: { id: req.params.id },
    })

    logger.info({ templateId: req.params.id }, 'Template deleted')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to delete template')
    res.status(500).json({ error: 'Failed to delete template' })
  }
})

// Clone template
templatesRouter.post('/:id/clone', async (req, res) => {
  try {
    const original = await prisma.callTemplate.findUnique({
      where: { id: req.params.id },
    })

    if (!original) {
      return res.status(404).json({ error: 'Template not found' })
    }

    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = original

    const clone = await prisma.callTemplate.create({
      data: {
        ...data,
        name: `${data.name} (Copy)`,
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

    logger.info({ originalId: req.params.id, cloneId: clone.id }, 'Template cloned')
    res.status(201).json({
      ...clone,
      twilioOptions: JSON.parse(clone.twilioOptions),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to clone template')
    res.status(500).json({ error: 'Failed to clone template' })
  }
})
