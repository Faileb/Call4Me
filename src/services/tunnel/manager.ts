import { TunnelProvider, TunnelStatus, TunnelType } from './types.js'
import { NgrokTunnel } from './ngrok.js'
import { TailscaleTunnel } from './tailscale.js'
import { CloudflareTunnel } from './cloudflare.js'
import { configService } from '../configService.js'
import { config, updateConfig } from '../../config.js'
import { logger } from '../../utils/logger.js'

class TunnelManager {
  private activeTunnel: TunnelProvider | null = null
  private startTime: Date | null = null

  private createProvider(type: TunnelType): TunnelProvider | null {
    switch (type) {
      case 'ngrok':
        return new NgrokTunnel()
      case 'tailscale':
        return new TailscaleTunnel()
      case 'cloudflare':
        return new CloudflareTunnel()
      default:
        return null
    }
  }

  async start(type: TunnelType): Promise<string> {
    // Stop any existing tunnel first
    await this.stop()

    const provider = this.createProvider(type)
    if (!provider) {
      throw new Error(`Unknown tunnel type: ${type}`)
    }

    // Check if the provider is available
    const available = await provider.isAvailable()
    if (!available) {
      throw new Error(
        `${type} is not available. Please ensure it is installed and configured.`
      )
    }

    // Start the tunnel
    const url = await provider.start(config.port)

    // Store the active tunnel
    this.activeTunnel = provider
    this.startTime = new Date()

    // Update config with the new URL
    await configService.set('appBaseUrl', url)
    await configService.set('tunnelType', type)
    await configService.setTunnelConfigMany({
      tunnelActive: true,
      tunnelUrl: url,
      tunnelError: null,
    })

    // Update runtime config
    updateConfig({ appBaseUrl: url })

    logger.info({ type, url }, 'Tunnel started')
    return url
  }

  async stop(): Promise<void> {
    if (this.activeTunnel) {
      await this.activeTunnel.stop()

      // Update database state
      await configService.setTunnelConfigMany({
        tunnelActive: false,
        tunnelUrl: null,
      })

      logger.info({ type: this.activeTunnel.type }, 'Tunnel stopped')
      this.activeTunnel = null
      this.startTime = null
    }
  }

  async getStatus(): Promise<TunnelStatus> {
    const url = this.activeTunnel
      ? await this.activeTunnel.getUrl()
      : await configService.getTunnelConfig('tunnelUrl')

    const active = this.activeTunnel !== null
    const type = this.activeTunnel?.type || null
    const error = (await configService.getTunnelConfig('tunnelError')) || null

    return {
      active,
      type,
      url,
      error,
      uptime: this.startTime
        ? Math.floor((Date.now() - this.startTime.getTime()) / 1000)
        : undefined,
    }
  }

  async checkAvailability(): Promise<
    Record<TunnelType, { available: boolean; message?: string }>
  > {
    const ngrok = new NgrokTunnel()
    const tailscale = new TailscaleTunnel()
    const cloudflare = new CloudflareTunnel()

    const [ngrokAvailable, tailscaleAvailable, cloudflareAvailable] =
      await Promise.all([
        ngrok.isAvailable(),
        tailscale.isAvailable(),
        cloudflare.isAvailable(),
      ])

    return {
      ngrok: {
        available: ngrokAvailable,
        message: ngrokAvailable
          ? 'Ready to use'
          : 'ngrok npm package bundled with app',
      },
      tailscale: {
        available: tailscaleAvailable,
        message: tailscaleAvailable
          ? 'Tailscale is installed and configured'
          : 'Install Tailscale and enable Funnel in your tailnet ACLs',
      },
      cloudflare: {
        available: cloudflareAvailable,
        message: cloudflareAvailable
          ? 'cloudflared CLI is installed'
          : 'Install cloudflared CLI from Cloudflare',
      },
      none: {
        available: true,
        message: 'Manual URL configuration',
      },
    }
  }

  async autoStart(): Promise<void> {
    const tunnelType = (await configService.get('tunnelType')) as TunnelType | null
    const autoStart = await configService.get('tunnelAutoStart')

    if (tunnelType && tunnelType !== 'none' && autoStart) {
      try {
        await this.start(tunnelType)
        logger.info({ type: tunnelType }, 'Tunnel auto-started')
      } catch (error) {
        logger.error({ error, type: tunnelType }, 'Failed to auto-start tunnel')
        await configService.setTunnelConfig(
          'tunnelError',
          error instanceof Error ? error.message : 'Failed to start tunnel'
        )
      }
    }
  }
}

// Export singleton instance
export const tunnelManager = new TunnelManager()
