import { Router } from 'express'
import { tunnelManager } from '../../services/tunnel/manager.js'
import { TunnelType } from '../../services/tunnel/types.js'
import { configService } from '../../services/configService.js'
import { logger } from '../../utils/logger.js'

export const tunnelRouter = Router()

// Get current tunnel status
tunnelRouter.get('/status', async (_req, res) => {
  try {
    const status = await tunnelManager.getStatus()
    res.json(status)
  } catch (error) {
    logger.error({ error }, 'Failed to get tunnel status')
    res.status(500).json({ error: 'Failed to get tunnel status' })
  }
})

// Check which tunnel services are available
tunnelRouter.get('/check', async (_req, res) => {
  try {
    const availability = await tunnelManager.checkAvailability()
    res.json(availability)
  } catch (error) {
    logger.error({ error }, 'Failed to check tunnel availability')
    res.status(500).json({ error: 'Failed to check tunnel availability' })
  }
})

// Start a tunnel
tunnelRouter.post('/start', async (req, res) => {
  try {
    const { type } = req.body as { type: TunnelType }

    if (!type || !['ngrok', 'tailscale', 'cloudflare'].includes(type)) {
      return res.status(400).json({ error: 'Invalid tunnel type' })
    }

    const url = await tunnelManager.start(type)
    res.json({ success: true, url })
  } catch (error) {
    logger.error({ error }, 'Failed to start tunnel')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start tunnel',
    })
  }
})

// Stop the tunnel
tunnelRouter.post('/stop', async (_req, res) => {
  try {
    await tunnelManager.stop()
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to stop tunnel')
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop tunnel',
    })
  }
})

// Configure tunnel settings
tunnelRouter.patch('/config', async (req, res) => {
  try {
    const { ngrokAuthToken, ngrokRegion, cloudflareTunnelToken, cloudflareTunnelId, autoStart } =
      req.body

    // Update secrets
    if (ngrokAuthToken !== undefined) {
      if (ngrokAuthToken) {
        await configService.setSecret('ngrokAuthToken', ngrokAuthToken)
      } else {
        await configService.deleteSecret('ngrokAuthToken')
      }
    }

    if (cloudflareTunnelToken !== undefined) {
      if (cloudflareTunnelToken) {
        await configService.setSecret('cloudflareTunnelToken', cloudflareTunnelToken)
      } else {
        await configService.deleteSecret('cloudflareTunnelToken')
      }
    }

    // Update tunnel config
    if (ngrokRegion) {
      await configService.setTunnelConfig('ngrokRegion', ngrokRegion)
    }

    if (cloudflareTunnelId !== undefined) {
      await configService.setTunnelConfig('cloudflareTunnelId', cloudflareTunnelId || null)
    }

    if (autoStart !== undefined) {
      await configService.set('tunnelAutoStart', autoStart)
    }

    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to update tunnel config')
    res.status(500).json({ error: 'Failed to update tunnel config' })
  }
})

// Get tunnel config (with secrets masked)
tunnelRouter.get('/config', async (_req, res) => {
  try {
    const hasNgrokToken = await configService.hasSecret('ngrokAuthToken')
    const hasCloudflareToken = await configService.hasSecret('cloudflareTunnelToken')
    const ngrokRegion = await configService.getTunnelConfig('ngrokRegion')
    const cloudflareTunnelId = await configService.getTunnelConfig('cloudflareTunnelId')
    const tunnelType = await configService.get('tunnelType')
    const autoStart = await configService.get('tunnelAutoStart')

    res.json({
      hasNgrokToken,
      hasCloudflareToken,
      ngrokRegion,
      cloudflareTunnelId,
      tunnelType,
      autoStart,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get tunnel config')
    res.status(500).json({ error: 'Failed to get tunnel config' })
  }
})

// Test webhook connectivity
tunnelRouter.post('/test', async (req, res) => {
  try {
    const { url } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL is required' })
    }

    // Try to make a request to the webhook endpoint
    const testUrl = `${url}/health`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(testUrl, {
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.ok) {
        res.json({ success: true, message: 'URL is accessible' })
      } else {
        res.json({
          success: false,
          message: `URL returned status ${response.status}`,
        })
      }
    } catch (fetchError) {
      clearTimeout(timeout)
      res.json({
        success: false,
        message: 'URL is not accessible or timed out',
      })
    }
  } catch (error) {
    logger.error({ error }, 'Failed to test connectivity')
    res.status(500).json({ error: 'Failed to test connectivity' })
  }
})
