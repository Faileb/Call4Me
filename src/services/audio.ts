import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { logger } from '../utils/logger.js'

// Twilio-supported audio formats
export const TWILIO_SUPPORTED_FORMATS = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav']

// Formats we accept (will be converted if needed)
export const ACCEPTED_UPLOAD_FORMATS = [
  'audio/mpeg',     // MP3
  'audio/wav',      // WAV
  'audio/wave',
  'audio/x-wav',
  'audio/webm',     // Browser recording format (needs conversion)
  'audio/ogg',      // OGG (needs conversion)
  'audio/mp4',      // M4A (needs conversion)
  'audio/m4a',
  'audio/x-m4a',
  'audio/opus',     // Opus (needs conversion)
]

/**
 * Check if a MIME type needs conversion for Twilio
 */
export function needsConversion(mimeType: string): boolean {
  return !TWILIO_SUPPORTED_FORMATS.includes(mimeType)
}

/**
 * Check if FFmpeg is available on the system
 */
export async function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'])
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
  })
}

/**
 * Get audio duration using FFprobe
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ])

    let output = ''
    proc.stdout.on('data', (data) => {
      output += data.toString()
    })

    proc.on('error', (err) => {
      logger.warn({ err }, 'FFprobe not available, cannot get duration')
      resolve(0)
    })

    proc.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim())
        resolve(isNaN(duration) ? 0 : duration)
      } else {
        resolve(0)
      }
    })
  })
}

/**
 * Convert audio file to WAV format (8kHz mono, which is optimal for telephony)
 * Returns the new file path
 */
export async function convertToWav(
  inputPath: string,
  outputDir: string
): Promise<{ path: string; filename: string; mimeType: string }> {
  const inputFilename = path.basename(inputPath)
  const outputFilename = inputFilename.replace(/\.[^.]+$/, '.wav')
  const outputPath = path.join(outputDir, outputFilename)

  logger.info({ inputPath, outputPath }, 'Converting audio to WAV')

  return new Promise((resolve, reject) => {
    // Convert to 8kHz mono WAV (optimal for telephone networks)
    // Using PCM signed 16-bit little-endian format
    const proc = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '8000',        // 8kHz sample rate (telephone standard)
      '-ac', '1',           // Mono
      '-acodec', 'pcm_s16le', // PCM signed 16-bit little-endian
      '-y',                 // Overwrite output file
      outputPath,
    ])

    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', (err) => {
      logger.error({ err }, 'FFmpeg process error')
      reject(new Error('FFmpeg not installed or not in PATH. Please install FFmpeg.'))
    })

    proc.on('close', async (code) => {
      if (code === 0) {
        // Delete the original file
        try {
          await fs.unlink(inputPath)
          logger.info({ inputPath }, 'Deleted original file after conversion')
        } catch (err) {
          logger.warn({ err, inputPath }, 'Failed to delete original file')
        }

        resolve({
          path: outputPath,
          filename: outputFilename,
          mimeType: 'audio/wav',
        })
      } else {
        logger.error({ code, stderr }, 'FFmpeg conversion failed')
        reject(new Error(`Audio conversion failed: ${stderr.slice(-500)}`))
      }
    })
  })
}

/**
 * Process an uploaded audio file:
 * - Convert to WAV if needed
 * - Get duration
 * Returns updated file info
 */
export async function processAudioFile(
  filePath: string,
  mimeType: string,
  outputDir: string
): Promise<{
  path: string
  filename: string
  mimeType: string
  duration: number
}> {
  // Check if FFmpeg is available
  const hasFfmpeg = await checkFfmpeg()

  if (needsConversion(mimeType)) {
    if (!hasFfmpeg) {
      throw new Error(
        `Audio format "${mimeType}" needs conversion but FFmpeg is not installed. ` +
        'Please install FFmpeg or upload MP3/WAV files directly.'
      )
    }

    const converted = await convertToWav(filePath, outputDir)
    const duration = await getAudioDuration(converted.path)

    return {
      ...converted,
      duration,
    }
  }

  // No conversion needed, just get duration
  const duration = hasFfmpeg ? await getAudioDuration(filePath) : 0

  return {
    path: filePath,
    filename: path.basename(filePath),
    mimeType,
    duration,
  }
}
