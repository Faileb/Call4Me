import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import { pinoHttp } from 'pino-http'
import { config, updateConfig } from './config.js'
import { logger } from './utils/logger.js'
import { prisma } from './db/client.js'
import { metricsMiddleware, metricsEndpoint } from './services/metrics.js'
import { cryptoService } from './services/crypto.js'
import { configService } from './services/configService.js'
import { setupModeMiddleware } from './middleware/setup.js'

// Routes
import { authRouter } from './routes/api/auth.js'
import { recordingsRouter } from './routes/api/recordings.js'
import { contactsRouter } from './routes/api/contacts.js'
import { templatesRouter } from './routes/api/templates.js'
import { callsRouter } from './routes/api/calls.js'
import { settingsRouter } from './routes/api/settings.js'
import { setupRouter } from './routes/api/setup.js'
import { tunnelRouter } from './routes/api/tunnel.js'
import { twilioWebhooksRouter } from './routes/twilio/webhooks.js'
import { authMiddleware } from './middleware/auth.js'
import { initScheduler } from './services/scheduler.js'
import { checkFfmpeg } from './services/audio.js'
import { tunnelManager } from './services/tunnel/manager.js'

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

// Session configuration (secret will be set during initialization)
let sessionMiddleware: express.RequestHandler | null = null

function initializeSession(secret: string) {
  sessionMiddleware = session({
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      // 'auto' means secure cookie only when connection is HTTPS
      // This allows HTTP access on local network while requiring HTTPS externally
      secure: 'auto',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
}

// Dynamic session middleware
app.use((req, res, next) => {
  if (sessionMiddleware) {
    sessionMiddleware(req, res, next)
  } else {
    next()
  }
})

// Health check (public)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Metrics endpoint (public for Prometheus scraping)
app.get('/metrics', metricsEndpoint)

// Setup mode middleware - blocks most routes during setup
app.use(setupModeMiddleware)

// Setup routes (always available, but most operations only work in setup mode)
app.use('/api/setup', setupRouter)

// Twilio webhooks (public, validated by Twilio signature)
app.use('/api/twilio', twilioWebhooksRouter)

// Auth routes (public)
app.use('/api/auth', authRouter)

// Protected routes - auth middleware is applied dynamically based on config
app.use('/api', (req, res, next) => {
  // Skip auth if disabled or in setup mode
  if (config.disableAuth || config.isSetupMode) {
    return next()
  }
  authMiddleware(req, res, next)
})

app.use('/api/recordings', recordingsRouter)
app.use('/api/contacts', contactsRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/calls', callsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/tunnel', tunnelRouter)

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
  if (!config.appBaseUrl) {
    // No base URL configured - will be set during setup
    return
  }

  const url = config.appBaseUrl.toLowerCase()
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')
  const isHttp = url.startsWith('http://') && !url.includes('localhost')

  if (isLocal) {
    logger.warn('=' .repeat(70))
    logger.warn('WARNING: APP_BASE_URL is set to a localhost address!')
    logger.warn(`Current value: ${config.appBaseUrl}`)
    logger.warn('')
    logger.warn('Twilio webhooks require a publicly accessible URL.')
    logger.warn('Configure a tunnel service in Settings > Network, or use:')
    logger.warn('  1. Run: ngrok http 3000')
    logger.warn('  2. Update the base URL in the web UI settings')
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

// Load configuration from database
async function loadConfigFromDatabase() {
  // Load config values from database
  const twilioSid = await configService.getSecret('twilioAccountSid')
  const twilioToken = await configService.getSecret('twilioAuthToken')
  const twilioPhone = await configService.getSecret('twilioPhoneNumber')
  const baseUrl = await configService.get('appBaseUrl')
  const port = await configService.get('appPort')
  const logLevel = await configService.get('logLevel')
  const disableAuth = await configService.get('disableAuth')
  const recordingsPath = await configService.get('recordingsPath')

  // Update runtime config with values from database (env vars take precedence via configService)
  updateConfig({
    twilioAccountSid: twilioSid || config.twilioAccountSid,
    twilioAuthToken: twilioToken || config.twilioAuthToken,
    twilioPhoneNumber: twilioPhone || config.twilioPhoneNumber,
    appBaseUrl: baseUrl || config.appBaseUrl,
    port: port || config.port,
    logLevel: (logLevel as typeof config.logLevel) || config.logLevel,
    disableAuth: disableAuth ?? config.disableAuth,
    recordingsPath: recordingsPath || config.recordingsPath,
  })
}

// Start server
async function start() {
  try {
    // Step 1: Initialize crypto service (loads/generates APP_SECRET)
    await cryptoService.initialize()
    const appSecret = cryptoService.getAppSecret()
    updateConfig({ appSecret })
    initializeSession(appSecret)
    logger.info('Crypto service initialized')

    // Step 2: Test database connection
    await prisma.$connect()
    logger.info('Database connected')

    // Step 3: Initialize config service with database
    configService.setPrisma(prisma)
    await configService.initialize()
    logger.info('Config service initialized')

    // Step 4: Check if setup is complete
    const isSetupComplete = await configService.isSetupComplete()

    if (!isSetupComplete) {
      // Enter setup mode
      updateConfig({ isSetupMode: true })
      logger.info('=' .repeat(70))
      logger.info('SETUP REQUIRED')
      logger.info('')
      logger.info('This is a new installation. Please complete the setup wizard.')
      logger.info(`Open http://localhost:${config.port} in your browser to get started.`)
      logger.info('=' .repeat(70))
    } else {
      // Load full configuration from database
      await loadConfigFromDatabase()
      updateConfig({ isSetupMode: false })

      // Check APP_BASE_URL configuration
      checkBaseUrl()

      // Check FFmpeg availability
      await checkFfmpegAvailability()

      // Auto-start tunnel if configured
      await tunnelManager.autoStart()

      // Initialize scheduler for pending jobs
      await initScheduler()
      logger.info('Scheduler initialized')
    }

    app.listen(config.port, () => {
      if (config.isSetupMode) {
        logger.info({ port: config.port }, 'Server started in SETUP MODE')
      } else {
        logger.info({ port: config.port, baseUrl: config.appBaseUrl }, 'Server started')
      }
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
