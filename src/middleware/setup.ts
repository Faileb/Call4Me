import { Request, Response, NextFunction } from 'express'
import { config } from '../config.js'

// Middleware to block access to most routes during setup mode
// Only allows: /health, /metrics, /api/setup/*, /api/auth/session
export function setupModeMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If not in setup mode, allow everything
  if (!config.isSetupMode) {
    next()
    return
  }

  const path = req.path

  // Always allow these routes during setup
  const allowedPaths = [
    '/health',
    '/metrics',
    '/api/setup',
    '/api/auth/session',
    '/api/tunnel', // Needed for tunnel configuration during setup
  ]

  const isAllowed = allowedPaths.some(
    (allowed) => path === allowed || path.startsWith(allowed + '/')
  )

  if (isAllowed) {
    next()
    return
  }

  // Block other routes with a helpful message
  res.status(503).json({
    error: 'Application setup required',
    setupRequired: true,
    message: 'Please complete the setup wizard before using this feature.',
  })
}
