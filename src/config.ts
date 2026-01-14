import 'dotenv/config'
import { z } from 'zod'

const configSchema = z.object({
  // Twilio
  twilioAccountSid: z.string().min(1),
  twilioAuthToken: z.string().min(1),
  twilioPhoneNumber: z.string().min(1),

  // App
  port: z.coerce.number().default(3000),
  appSecret: z.string().min(32),
  appBaseUrl: z.string().url(),
  appPassword: z.string().optional(),
  appPasswordHash: z.string().optional(),

  // Storage
  recordingsPath: z.string().default('./data/recordings'),

  // Options
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  disableAuth: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  isProduction: z.boolean().default(process.env.NODE_ENV === 'production'),
})

function loadConfig() {
  const result = configSchema.safeParse({
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
    port: process.env.APP_PORT || process.env.PORT,
    appSecret: process.env.APP_SECRET,
    appBaseUrl: process.env.APP_BASE_URL,
    appPassword: process.env.APP_PASSWORD,
    appPasswordHash: process.env.APP_PASSWORD_HASH,
    recordingsPath: process.env.RECORDINGS_PATH,
    logLevel: process.env.LOG_LEVEL,
    disableAuth: process.env.DISABLE_AUTH,
    isProduction: process.env.NODE_ENV === 'production',
  })

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format())
    process.exit(1)
  }

  return result.data
}

export const config = loadConfig()
export type Config = z.infer<typeof configSchema>
