import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../db/client.js'
import { logger } from '../../utils/logger.js'

export const contactsRouter = Router()

// Validation schemas
const createContactSchema = z.object({
  name: z.string().min(1).max(255),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format'),
  notes: z.string().max(1000).nullable().optional(),
})

const updateContactSchema = createContactSchema.partial()

// List all contacts
contactsRouter.get('/', async (req, res) => {
  try {
    const { search } = req.query

    const contacts = await prisma.contact.findMany({
      where: search
        ? {
            name: {
              contains: search as string,
            },
          }
        : undefined,
      orderBy: { name: 'asc' },
    })

    res.json(contacts)
  } catch (error) {
    logger.error({ error }, 'Failed to list contacts')
    res.status(500).json({ error: 'Failed to list contacts' })
  }
})

// Get single contact
contactsRouter.get('/:id', async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
    })

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' })
    }

    res.json(contact)
  } catch (error) {
    logger.error({ error }, 'Failed to get contact')
    res.status(500).json({ error: 'Failed to get contact' })
  }
})

// Create contact
contactsRouter.post('/', async (req, res) => {
  try {
    const validation = createContactSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const contact = await prisma.contact.create({
      data: validation.data,
    })

    logger.info({ contactId: contact.id }, 'Contact created')
    res.status(201).json(contact)
  } catch (error) {
    logger.error({ error }, 'Failed to create contact')
    res.status(500).json({ error: 'Failed to create contact' })
  }
})

// Update contact
contactsRouter.patch('/:id', async (req, res) => {
  try {
    const validation = updateContactSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() })
    }

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: validation.data,
    })

    logger.info({ contactId: contact.id }, 'Contact updated')
    res.json(contact)
  } catch (error) {
    logger.error({ error }, 'Failed to update contact')
    res.status(500).json({ error: 'Failed to update contact' })
  }
})

// Delete contact
contactsRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.contact.delete({
      where: { id: req.params.id },
    })

    logger.info({ contactId: req.params.id }, 'Contact deleted')
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to delete contact')
    res.status(500).json({ error: 'Failed to delete contact' })
  }
})
