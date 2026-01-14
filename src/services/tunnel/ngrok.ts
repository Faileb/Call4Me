import ngrok from '@ngrok/ngrok'
import { TunnelProvider, TunnelType } from './types.js'
import { configService } from '../configService.js'
import { logger } from '../../utils/logger.js'

export class NgrokTunnel implements TunnelProvider {
  readonly type: TunnelType = 'ngrok'
  private listener: ngrok.Listener | null = null
  private url: string | null = null

  async start(port: number): Promise<string> {
    // Get auth token from secrets
    const authToken = await configService.getSecret('ngrokAuthToken')

    if (authToken) {
      // Set the auth token for this session
      await ngrok.authtoken(authToken)
    }

    // Get region from config
    const region = (await configService.getTunnelConfig('ngrokRegion')) || 'us'

    logger.info({ port, region }, 'Starting ngrok tunnel')

    try {
      // Start the tunnel
      this.listener = await ngrok.forward({
        addr: port,
        authtoken: authToken || undefined,
      })

      this.url = this.listener.url() || null

      if (!this.url) {
        throw new Error('Failed to get ngrok URL')
      }

      logger.info({ url: this.url }, 'ngrok tunnel started')
      return this.url
    } catch (error) {
      logger.error({ error }, 'Failed to start ngrok tunnel')
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.listener) {
      try {
        await this.listener.close()
        logger.info('ngrok tunnel stopped')
      } catch (error) {
        logger.error({ error }, 'Error stopping ngrok tunnel')
      }
      this.listener = null
      this.url = null
    }
  }

  async getUrl(): Promise<string | null> {
    return this.url
  }

  async isAvailable(): Promise<boolean> {
    // ngrok npm package is always available since we bundle it
    return true
  }
}
