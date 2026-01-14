import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import { Phone, Mic, Calendar, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'
import { formatPhoneDisplay } from '../lib/phone'

export function Dashboard() {
  const { data: recordings } = useQuery({
    queryKey: ['recordings'],
    queryFn: api.recordings.list,
  })

  const { data: scheduledCalls } = useQuery({
    queryKey: ['scheduled-calls'],
    queryFn: api.calls.scheduled.list,
  })

  const { data: historyData } = useQuery({
    queryKey: ['call-history', { limit: 5 }],
    queryFn: () => api.calls.history.list({ limit: 5 }),
  })

  const { data: status } = useQuery({
    queryKey: ['settings', 'status'],
    queryFn: api.settings.getStatus,
  })

  const pendingCalls = scheduledCalls?.filter((c) => c.status === 'pending') || []
  const nextCall = pendingCalls.sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )[0]

  const recentCalls = historyData?.data || []

  const stats = [
    {
      name: 'Recordings',
      value: recordings?.length || 0,
      icon: Mic,
      href: '/recordings',
      color: 'bg-blue-100 text-blue-600',
    },
    {
      name: 'Scheduled Calls',
      value: pendingCalls.length,
      icon: Calendar,
      href: '/queue',
      color: 'bg-green-100 text-green-600',
    },
    {
      name: 'Completed Today',
      value: recentCalls.filter(
        (c) =>
          c.status === 'completed' &&
          new Date(c.initiatedAt).toDateString() === new Date().toDateString()
      ).length,
      icon: CheckCircle,
      href: '/history',
      color: 'bg-emerald-100 text-emerald-600',
    },
    {
      name: 'Failed Today',
      value: recentCalls.filter(
        (c) =>
          ['failed', 'busy', 'no_answer'].includes(c.status) &&
          new Date(c.initiatedAt).toDateString() === new Date().toDateString()
      ).length,
      icon: XCircle,
      href: '/history',
      color: 'bg-red-100 text-red-600',
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome to Call4Me</p>
      </div>

      {/* Configuration Warning */}
      {status?.isLocalhost && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">Twilio Webhooks Unreachable</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Your server is configured with <code className="bg-yellow-100 px-1 rounded">{status.appBaseUrl}</code> which
                Twilio cannot reach. Calls will fail until you use a public URL.
              </p>
              <p className="text-sm text-yellow-700 mt-2">
                <strong>Quick fix:</strong> Run <code className="bg-yellow-100 px-1 rounded">ngrok http 3000</code> and
                update <code className="bg-yellow-100 px-1 rounded">APP_BASE_URL</code> in your .env file.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Link
            key={stat.name}
            to={stat.href}
            className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className={clsx('p-3 rounded-lg', stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.name}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Next Call Card */}
      {nextCall && (
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-6 rounded-xl text-white">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-6 h-6" />
            <h2 className="text-lg font-semibold">Next Scheduled Call</h2>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-2xl font-bold">
                {nextCall.contact?.name || formatPhoneDisplay(nextCall.phoneNumber)}
              </p>
              <p className="text-primary-100">
                {format(new Date(nextCall.scheduledAt), 'PPpp')}
              </p>
              <p className="text-primary-200 text-sm">
                {formatDistanceToNow(new Date(nextCall.scheduledAt), { addSuffix: true })}
              </p>
            </div>
            <Link
              to="/queue"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <Phone className="w-4 h-4" />
              View Queue
            </Link>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        {recentCalls.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {recentCalls.map((call) => (
              <div key={call.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={clsx(
                      'p-2 rounded-full',
                      call.status === 'completed'
                        ? 'bg-green-100 text-green-600'
                        : ['failed', 'busy', 'no_answer'].includes(call.status)
                        ? 'bg-red-100 text-red-600'
                        : 'bg-yellow-100 text-yellow-600'
                    )}
                  >
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {call.contact?.name || formatPhoneDisplay(call.phoneNumber)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {call.recording?.name || 'Unknown recording'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={clsx(
                      'inline-block px-2 py-1 text-xs font-medium rounded-full',
                      call.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : ['failed', 'busy', 'no_answer'].includes(call.status)
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    )}
                  >
                    {call.status.replace('_', ' ')}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(call.initiatedAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Phone className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No recent calls</p>
          </div>
        )}
        <div className="p-4 border-t border-gray-100">
          <Link
            to="/history"
            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            View all history &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
