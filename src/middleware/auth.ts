import { Request, Response, NextFunction } from 'express'

declare module 'express-session' {
  interface SessionData {
    authenticated: boolean
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
