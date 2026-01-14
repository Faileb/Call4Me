import { Request, Response, NextFunction } from 'express'
import client from 'prom-client'

// Create a Registry to register metrics
const register = new client.Registry()

// Add default metrics (memory, CPU, etc.)
client.collectDefaultMetrics({ register })

// Custom metrics
export const callsTotal = new client.Counter({
  name: 'call4me_calls_total',
  help: 'Total number of calls made',
  labelNames: ['status'] as const,
  registers: [register],
})

export const callsScheduled = new client.Gauge({
  name: 'call4me_calls_scheduled',
  help: 'Number of pending scheduled calls',
  registers: [register],
})

export const callDuration = new client.Histogram({
  name: 'call4me_call_duration_seconds',
  help: 'Duration of calls in seconds',
  buckets: [5, 10, 30, 60, 120, 300],
  registers: [register],
})

export const recordingsTotal = new client.Gauge({
  name: 'call4me_recordings_total',
  help: 'Total number of recordings',
  registers: [register],
})

export const lastCallTimestamp = new client.Gauge({
  name: 'call4me_last_call_timestamp',
  help: 'Timestamp of the last call (Unix seconds)',
  registers: [register],
})

export const httpRequestDuration = new client.Histogram({
  name: 'call4me_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
})

// Middleware to track request duration
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000
    const route = req.route?.path || req.path
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      },
      duration
    )
  })

  next()
}

// Endpoint to expose metrics
export async function metricsEndpoint(_req: Request, res: Response) {
  res.set('Content-Type', register.contentType)
  res.send(await register.metrics())
}
