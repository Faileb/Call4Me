import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import {
  Mic,
  Upload,
  Play,
  Pause,
  Trash2,
  Edit2,
  X,
  Check,
  Tag,
} from 'lucide-react'
import { api, Recording } from '../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { AudioRecorder } from '../components/AudioRecorder'

export function Recordings() {
  const [showUpload, setShowUpload] = useState(false)
  const [showRecorder, setShowRecorder] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

  const queryClient = useQueryClient()

  const { data: recordings, isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: api.recordings.list,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) =>
      api.recordings.upload(file, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      setShowUpload(false)
      toast.success('Recording uploaded')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Recording> }) =>
      api.recordings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      setEditingId(null)
      toast.success('Recording updated')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: api.recordings.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      toast.success('Recording deleted')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate({ file, name: file.name.replace(/\.[^/.]+$/, '') })
    }
  }

  const handlePlay = (recording: Recording) => {
    if (playingId === recording.id) {
      audioElement?.pause()
      setPlayingId(null)
    } else {
      audioElement?.pause()
      const audio = new Audio(api.recordings.audioUrl(recording.id))
      audio.onended = () => setPlayingId(null)
      audio.play()
      setAudioElement(audio)
      setPlayingId(recording.id)
    }
  }

  const startEditing = (recording: Recording) => {
    setEditingId(recording.id)
    setEditName(recording.name)
    setEditDescription(recording.description || '')
  }

  const saveEdit = () => {
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: { name: editName, description: editDescription },
      })
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recordings</h1>
          <p className="text-gray-500">Manage your voice recordings</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowRecorder(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Mic className="w-4 h-4" />
            Record
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Upload Recording</h2>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4">
                Drag and drop an audio file, or click to browse
              </p>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg cursor-pointer hover:bg-primary-700"
              >
                Choose File
              </label>
            </div>
            <button
              onClick={() => setShowUpload(false)}
              className="mt-4 w-full py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Record Modal */}
      {showRecorder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Record Audio</h2>
              <button
                onClick={() => setShowRecorder(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <AudioRecorder
              onSave={() => {
                queryClient.invalidateQueries({ queryKey: ['recordings'] })
                setShowRecorder(false)
              }}
            />
          </div>
        </div>
      )}

      {/* Recordings List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : recordings?.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <Mic className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No recordings yet</h3>
          <p className="text-gray-500 mb-4">
            Upload an audio file or record one using your microphone
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {recordings?.map((recording) => (
            <div key={recording.id} className="p-4 flex items-center gap-4">
              {/* Play button */}
              <button
                onClick={() => handlePlay(recording)}
                className={clsx(
                  'p-3 rounded-full transition-colors',
                  playingId === recording.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {playingId === recording.id ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>

              {/* Recording info */}
              <div className="flex-1 min-w-0">
                {editingId === recording.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description (optional)"
                      className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-gray-900 truncate">{recording.name}</p>
                    {recording.description && (
                      <p className="text-sm text-gray-500 truncate">{recording.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                      <span>{formatDuration(recording.duration)}</span>
                      <span>{formatFileSize(recording.size)}</span>
                      <span>
                        {formatDistanceToNow(new Date(recording.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </>
                )}

                {/* Tags */}
                {recording.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {recording.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {editingId === recording.id ? (
                  <>
                    <button
                      onClick={saveEdit}
                      className="p-2 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-2 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEditing(recording)}
                      className="p-2 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this recording?')) {
                          deleteMutation.mutate(recording.id)
                        }
                      }}
                      className="p-2 text-red-400 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
