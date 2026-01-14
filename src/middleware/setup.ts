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

  const urlPath = req.path

  // Always allow these routes during setup
  const allowedPaths = [
    '/health',
    '/metrics',
    '/api/setup',
    '/api/auth/session',
    '/api/tunnel', // Needed for tunnel configuration during setup
  ]

  // Allow static assets and frontend routes for setup wizard UI
  const isStaticAsset = urlPath.startsWith('/assets/') || urlPath.endsWith('.js') || urlPath.endsWith('.css') || urlPath.endsWith('.ico')
  const isFrontendRoute = !urlPath.startsWith('/api/')

  const isAllowed = isStaticAsset || isFrontendRoute || allowedPaths.some(
    (allowed) => urlPath === allowed || urlPath.startsWith(allowed + '/')
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
