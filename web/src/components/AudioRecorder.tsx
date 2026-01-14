import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Mic, Square, Play, Pause, Save, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'

interface AudioRecorderProps {
  onSave: () => void
}

export function AudioRecorder({ onSave }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [name, setName] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const saveMutation = useMutation({
    mutationFn: () =>
      api.recordings.saveRecording(recordedBlob!, {
        name: name || `Recording ${new Date().toLocaleString()}`,
        duration,
      }),
    onSuccess: () => {
      toast.success('Recording saved')
      onSave()
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setRecordedBlob(blob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } catch (error) {
      toast.error('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }

  const playRecording = () => {
    if (recordedBlob && !isPlaying) {
      const url = URL.createObjectURL(recordedBlob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        setIsPlaying(false)
        URL.revokeObjectURL(url)
      }

      audio.play()
      setIsPlaying(true)
    } else if (audioRef.current && isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }

  const resetRecording = () => {
    setRecordedBlob(null)
    setDuration(0)
    setIsPlaying(false)
    audioRef.current?.pause()
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Recording visualization */}
      <div className="flex flex-col items-center py-8">
        <div
          className={clsx(
            'w-24 h-24 rounded-full flex items-center justify-center transition-all',
            isRecording
              ? 'bg-red-100 animate-pulse'
              : recordedBlob
              ? 'bg-green-100'
              : 'bg-gray-100'
          )}
        >
          <Mic
            className={clsx(
              'w-10 h-10',
              isRecording ? 'text-red-600' : recordedBlob ? 'text-green-600' : 'text-gray-400'
            )}
          />
        </div>
        <p className="text-3xl font-mono mt-4">{formatTime(duration)}</p>
        <p className="text-sm text-gray-500 mt-1">
          {isRecording ? 'Recording...' : recordedBlob ? 'Recording complete' : 'Ready to record'}
        </p>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4">
        {!recordedBlob ? (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={clsx(
              'p-4 rounded-full transition-colors',
              isRecording
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
        ) : (
          <>
            <button
              onClick={playRecording}
              className="p-4 bg-primary-100 text-primary-600 rounded-full hover:bg-primary-200 transition-colors"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            <button
              onClick={resetRecording}
              className="p-4 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
            >
              <RotateCcw className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Save form */}
      {recordedBlob && (
        <div className="space-y-4 pt-4 border-t">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recording Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name for this recording"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-5 h-5" />
            {saveMutation.isPending ? 'Saving...' : 'Save Recording'}
          </button>
        </div>
      )}
    </div>
  )
}
