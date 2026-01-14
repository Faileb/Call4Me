import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { Clock, Play, Pause, Trash2, Phone, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { formatPhoneDisplay } from '../lib/phone'

export function Queue() {
  const queryClient = useQueryClient()

  const { data: calls, isLoading } = useQuery({
    queryKey: ['scheduled-calls'],
    queryFn: api.calls.scheduled.list,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const triggerMutation = useMutation({
    mutationFn: api.calls.scheduled.trigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] })
      queryClient.invalidateQueries({ queryKey: ['call-history'] })
      toast.success('Call triggered')
    },
    onError: (error) => toast.error(error.message),
  })

  const pauseMutation = useMutation({
    mutationFn: api.calls.scheduled.pause,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] })
      toast.success('Call paused')
    },
    onError: (error) => toast.error(error.message),
  })

  const resumeMutation = useMutation({
    mutationFn: api.calls.scheduled.resume,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] })
      toast.success('Call resumed')
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: api.calls.scheduled.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] })
      toast.success('Call deleted')
    },
    onError: (error) => toast.error(error.message),
  })

  const pendingCalls = calls?.filter((c) => c.status === 'pending') || []
  const pausedCalls = calls?.filter((c) => c.status === 'paused') || []
  const otherCalls = calls?.filter((c) => !['pending', 'paused'].includes(c.status)) || []

  const statusColors: Record<string, string> = {
    pending: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-gray-100 text-gray-700',
    failed: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call Queue</h1>
          <p className="text-gray-500">{pendingCalls.length} pending, {pausedCalls.length} paused</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : calls?.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <Clock className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No scheduled calls</h3>
          <p className="text-gray-500">Schedule a call to see it here</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {[...pendingCalls, ...pausedCalls, ...otherCalls].map((call) => (
            <div key={call.id} className="p-4 flex items-center gap-4">
              <div
                className={clsx(
                  'p-3 rounded-full',
                  call.status === 'pending'
                    ? 'bg-green-100 text-green-600'
                    : call.status === 'paused'
                    ? 'bg-yellow-100 text-yellow-600'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                <Phone className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">
                    {call.contact?.name || formatPhoneDisplay(call.phoneNumber)}
                  </p>
                  <span className={clsx('px-2 py-0.5 text-xs font-medium rounded-full', statusColors[call.status])}>
                    {call.status.replace('_', ' ')}
                  </span>
                  {call.recurrenceEnabled && (
                    <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Recurring
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{call.recording?.name}</p>
                <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                  <span>{format(new Date(call.scheduledAt), 'PPpp')}</span>
                  <span>{formatDistanceToNow(new Date(call.scheduledAt), { addSuffix: true })}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {call.status === 'pending' && (
                  <>
                    <button
                      onClick={() => triggerMutation.mutate(call.id)}
                      disabled={triggerMutation.isPending}
                      className="p-2 text-green-600 hover:bg-green-50 rounded"
                      title="Call Now"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => pauseMutation.mutate(call.id)}
                      className="p-2 text-yellow-600 hover:bg-yellow-50 rounded"
                      title="Pause"
                    >
                      <Pause className="w-5 h-5" />
                    </button>
                  </>
                )}
                {call.status === 'paused' && (
                  <button
                    onClick={() => resumeMutation.mutate(call.id)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded"
                    title="Resume"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => confirm('Delete this scheduled call?') && deleteMutation.mutate(call.id)}
                  className="p-2 text-red-400 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
