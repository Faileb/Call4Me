import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import { pinoHttp } from 'pino-http'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { prisma } from './db/client.js'
import { metricsMiddleware, metricsEndpoint } from './services/metrics.js'

// Routes
import { authRouter } from './routes/api/auth.js'
import { recordingsRouter } from './routes/api/recordings.js'
import { contactsRouter } from './routes/api/contacts.js'
import { templatesRouter } from './routes/api/templates.js'
import { callsRouter } from './routes/api/calls.js'
import { settingsRouter } from './routes/api/settings.js'
import { twilioWebhooksRouter } from './routes/twilio/webhooks.js'
import { authMiddleware } from './middleware/auth.js'
import { initScheduler } from './services/scheduler.js'
import { checkFfmpeg } from './services/audio.js'

const app = express()

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1)

// Request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health' || req.url === '/metrics',
    },
  })
)

// Middleware
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(metricsMiddleware)

// Session configuration
app.use(
  session({
    secret: config.appSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.isProduction,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
)

// Health check (public)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Metrics endpoint (public for Prometheus scraping)
app.get('/metrics', metricsEndpoint)

// Twilio webhooks (public, validated by Twilio signature)
app.use('/api/twilio', twilioWebhooksRouter)

// Auth routes (public)
app.use('/api/auth', authRouter)

// Protected routes
if (!config.disableAuth) {
  app.use('/api', authMiddleware)
}

app.use('/api/recordings', recordingsRouter)
app.use('/api/contacts', contactsRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/calls', callsRouter)
app.use('/api/settings', settingsRouter)

// Serve static frontend in production
if (config.isProduction) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const webDir = path.join(__dirname, '..', 'web', 'dist')

  app.use(express.static(webDir))

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDir, 'index.html'))
  })
}

// Error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, 'Unhandled error')
    res.status(500).json({ error: 'Internal server error' })
  }
)

// Check if APP_BASE_URL is publicly accessible
function checkBaseUrl() {
  const url = config.appBaseUrl.toLowerCase()
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')
  const isHttp = url.startsWith('http://') && !url.includes('localhost')

  if (isLocal) {
    logger.warn('=' .repeat(70))
    logger.warn('WARNING: APP_BASE_URL is set to a localhost address!')
    logger.warn(`Current value: ${config.appBaseUrl}`)
    logger.warn('')
    logger.warn('Twilio webhooks require a publicly accessible URL.')
    logger.warn('For local development, use a tunnel service like ngrok:')
    logger.warn('  1. Run: ngrok http 3000')
    logger.warn('  2. Update APP_BASE_URL in .env to the ngrok URL (e.g., https://abc123.ngrok.io)')
    logger.warn('  3. Restart this server')
    logger.warn('=' .repeat(70))
  } else if (isHttp) {
    logger.warn('WARNING: APP_BASE_URL uses HTTP instead of HTTPS.')
    logger.warn('Twilio may reject non-HTTPS callback URLs in production.')
  }
}

// Check FFmpeg availability
async function checkFfmpegAvailability() {
  const hasFfmpeg = await checkFfmpeg()
  if (hasFfmpeg) {
    logger.info('FFmpeg detected - audio conversion enabled')
  } else {
    logger.warn('=' .repeat(70))
    logger.warn('WARNING: FFmpeg is not installed!')
    logger.warn('')
    logger.warn('Browser recordings (WebM format) will fail without FFmpeg.')
    logger.warn('Twilio only supports MP3/WAV audio formats.')
    logger.warn('')
    logger.warn('To install FFmpeg:')
    logger.warn('  macOS:   brew install ffmpeg')
    logger.warn('  Ubuntu:  sudo apt install ffmpeg')
    logger.warn('  Windows: Download from https://ffmpeg.org/download.html')
    logger.warn('')
    logger.warn('Alternatively, upload MP3 or WAV files directly.')
    logger.warn('=' .repeat(70))
  }
}

// Start server
async function start() {
  try {
    // Test database connection
    await prisma.$connect()
    logger.info('Database connected')

    // Check APP_BASE_URL configuration
    checkBaseUrl()

    // Check FFmpeg availability
    await checkFfmpegAvailability()

    // Initialize scheduler for pending jobs
    await initScheduler()
    logger.info('Scheduler initialized')

    app.listen(config.port, () => {
      logger.info({ port: config.port, baseUrl: config.appBaseUrl }, 'Server started')
    })
  } catch (error) {
    logger.error({ error }, 'Failed to start server')
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down')
  await prisma.$disconnect()
  process.exit(0)
})

start()
