import { spawn, ChildProcess, execSync } from 'child_process'
import { TunnelProvider, TunnelType } from './types.js'
import { logger } from '../../utils/logger.js'

export class TailscaleTunnel implements TunnelProvider {
  readonly type: TunnelType = 'tailscale'
  private process: ChildProcess | null = null
  private url: string | null = null

  async start(port: number): Promise<string> {
    // Tailscale Funnel only supports ports 443, 8443, 10000
    // But it can proxy from those ports to our local port
    const funnelPort = 443

    logger.info({ port, funnelPort }, 'Starting Tailscale Funnel')

    try {
      // Start tailscale funnel
      // The command will proxy external funnelPort to local port
      this.process = spawn('tailscale', ['funnel', '--bg', `${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // Wait a moment for the funnel to start
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Get the URL from tailscale funnel status
      this.url = await this.getFunnelUrl()

      if (!this.url) {
        throw new Error('Failed to get Tailscale Funnel URL. Is Tailscale configured correctly?')
      }

      logger.info({ url: this.url }, 'Tailscale Funnel started')
      return this.url
    } catch (error) {
      logger.error({ error }, 'Failed to start Tailscale Funnel')
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      try {
        // Stop the funnel
        execSync('tailscale funnel off', { stdio: 'ignore' })
        this.process.kill()
        logger.info('Tailscale Funnel stopped')
      } catch (error) {
        logger.error({ error }, 'Error stopping Tailscale Funnel')
      }
      this.process = null
      this.url = null
    }
  }

  async getUrl(): Promise<string | null> {
    if (this.url) return this.url
    return this.getFunnelUrl()
  }

  private async getFunnelUrl(): Promise<string | null> {
    try {
      const output = execSync('tailscale funnel status', {
        encoding: 'utf-8',
        timeout: 5000,
      })

      // Parse the output to find the HTTPS URL
      // Example output: "https://device.tailnet-name.ts.net is forwarding to port 3000"
      const urlMatch = output.match(/https:\/\/[^\s]+\.ts\.net/)
      return urlMatch ? urlMatch[0] : null
    } catch {
      return null
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if tailscale is installed and running
      const output = execSync('tailscale status', {
        encoding: 'utf-8',
        timeout: 5000,
      })
      return output.includes('@') // Contains tailnet info
    } catch {
      return false
    }
  }
}
