import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { History as HistoryIcon, Phone, RefreshCw, Download, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { formatPhoneDisplay } from '../lib/phone'

export function History() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['call-history', { page, status: statusFilter }],
    queryFn: () => api.calls.history.list({ page, status: statusFilter || undefined, limit: 20 }),
  })

  const retryMutation = useMutation({
    mutationFn: api.calls.history.retry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-history'] })
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] })
      toast.success('Call retried')
    },
    onError: (error) => toast.error(error.message),
  })

  const statusColors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    busy: 'bg-orange-100 text-orange-700',
    no_answer: 'bg-yellow-100 text-yellow-700',
    initiated: 'bg-blue-100 text-blue-700',
    ringing: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-blue-100 text-blue-700',
    canceled: 'bg-gray-100 text-gray-700',
  }

  const amdColors: Record<string, string> = {
    human: 'bg-purple-100 text-purple-700',
    machine_end_beep: 'bg-indigo-100 text-indigo-700',
    machine_end_silence: 'bg-indigo-100 text-indigo-700',
    machine_start: 'bg-indigo-100 text-indigo-700',
    fax: 'bg-gray-100 text-gray-700',
  }

  const canRetry = (status: string) => ['failed', 'busy', 'no_answer'].includes(status)

  const handleExport = () => {
    const url = `/api/calls/history/export${statusFilter ? `?status=${statusFilter}` : ''}`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call History</h1>
          <p className="text-gray-500">
            {data?.pagination.total || 0} total calls
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 border rounded-lg',
              showFilters ? 'bg-primary-50 border-primary-500 text-primary-700' : 'border-gray-300 hover:bg-gray-50'
            )}
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">All</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="busy">Busy</option>
                <option value="no_answer">No Answer</option>
              </select>
            </div>
            {statusFilter && (
              <button
                onClick={() => { setStatusFilter(''); setPage(1); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : !data?.data.length ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <HistoryIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No call history</h3>
          <p className="text-gray-500">Your call logs will appear here</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {data.data.map((call) => (
              <div key={call.id} className="p-4 flex items-center gap-4">
                <div
                  className={clsx(
                    'p-3 rounded-full',
                    call.status === 'completed' ? 'bg-green-100 text-green-600' :
                    canRetry(call.status) ? 'bg-red-100 text-red-600' :
                    'bg-blue-100 text-blue-600'
                  )}
                >
                  <Phone className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900">
                      {call.contact?.name || formatPhoneDisplay(call.phoneNumber)}
                    </p>
                    <span className={clsx('px-2 py-0.5 text-xs font-medium rounded-full', statusColors[call.status])}>
                      {call.status.replace('_', ' ')}
                    </span>
                    {call.amdResult && (
                      <span className={clsx('px-2 py-0.5 text-xs font-medium rounded-full', amdColors[call.amdResult] || 'bg-gray-100 text-gray-700')}>
                        AMD: {call.amdResult.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{call.recording?.name}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-1 flex-wrap">
                    <span>{format(new Date(call.initiatedAt), 'PPpp')}</span>
                    {call.duration !== null && <span>{Math.round(call.duration)}s duration</span>}
                    <span>{formatDistanceToNow(new Date(call.initiatedAt), { addSuffix: true })}</span>
                    {call.twilioCallSid && (
                      <a
                        href={`https://www.twilio.com/console/voice/calls/logs/${call.twilioCallSid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary-500 hover:underline"
                        title="View in Twilio Console"
                      >
                        {call.twilioCallSid.slice(0, 12)}...
                      </a>
                    )}
                  </div>
                  {(call.errorCode || call.errorMessage) && (
                    <div className="text-xs text-red-500 mt-1 flex items-center gap-2">
                      {call.errorCode && (
                        <a
                          href={`https://www.twilio.com/docs/api/errors/${call.errorCode}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono underline hover:text-red-700"
                        >
                          Error {call.errorCode}
                        </a>
                      )}
                      {call.errorMessage && <span>{call.errorMessage}</span>}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {canRetry(call.status) && (
                    <button
                      onClick={() => retryMutation.mutate(call.id)}
                      disabled={retryMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page === data.pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
