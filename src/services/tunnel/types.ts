export type TunnelType = 'ngrok' | 'tailscale' | 'cloudflare' | 'none'

export interface TunnelStatus {
  active: boolean
  type: TunnelType | null
  url: string | null
  error: string | null
  uptime?: number
}

export interface TunnelProvider {
  readonly type: TunnelType
  start(port: number): Promise<string>
  stop(): Promise<void>
  getUrl(): Promise<string | null>
  isAvailable(): Promise<boolean>
}
