import { spawn, ChildProcess, execSync } from 'child_process'
import { TunnelProvider, TunnelType } from './types.js'
import { configService } from '../configService.js'
import { logger } from '../../utils/logger.js'

export class CloudflareTunnel implements TunnelProvider {
  readonly type: TunnelType = 'cloudflare'
  private process: ChildProcess | null = null
  private url: string | null = null

  async start(port: number): Promise<string> {
    // Get tunnel token from secrets
    const tunnelToken = await configService.getSecret('cloudflareTunnelToken')

    if (!tunnelToken) {
      throw new Error('Cloudflare tunnel token not configured. Please set it in Settings > Network.')
    }

    logger.info({ port }, 'Starting Cloudflare Tunnel')

    try {
      // Start cloudflared with the tunnel token
      // The tunnel and its URL are pre-configured in the Cloudflare dashboard
      this.process = spawn('cloudflared', ['tunnel', 'run', '--token', tunnelToken], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // The URL is configured in Cloudflare, we need to get it from TunnelConfig
      const tunnelId = await configService.getTunnelConfig('cloudflareTunnelId')

      // For Cloudflare, the URL must be pre-configured in settings
      // since it's determined by the Cloudflare dashboard configuration
      if (tunnelId) {
        // The user must have entered their tunnel URL during setup
        this.url = await configService.get('appBaseUrl')
      }

      // Wait a moment for the tunnel to connect
      await new Promise((resolve) => setTimeout(resolve, 3000))

      if (!this.url) {
        throw new Error(
          'Cloudflare tunnel URL not configured. Please enter your tunnel URL in Settings > Network.'
        )
      }

      // Listen for process errors
      this.process.stderr?.on('data', (data: Buffer) => {
        const message = data.toString()
        if (message.includes('ERR')) {
          logger.error({ message }, 'Cloudflare tunnel error')
        }
      })

      this.process.on('exit', (code) => {
        if (code !== 0) {
          logger.error({ code }, 'Cloudflare tunnel process exited')
        }
        this.process = null
      })

      logger.info({ url: this.url }, 'Cloudflare Tunnel started')
      return this.url
    } catch (error) {
      logger.error({ error }, 'Failed to start Cloudflare Tunnel')
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      try {
        this.process.kill()
        logger.info('Cloudflare Tunnel stopped')
      } catch (error) {
        logger.error({ error }, 'Error stopping Cloudflare Tunnel')
      }
      this.process = null
      this.url = null
    }
  }

  async getUrl(): Promise<string | null> {
    return this.url
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if cloudflared is installed
      execSync('which cloudflared', {
        encoding: 'utf-8',
        timeout: 5000,
      })
      return true
    } catch {
      return false
    }
  }
}
