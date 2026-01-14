import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, isBefore, startOfDay } from 'date-fns'
import { Calendar, Clock, ChevronLeft, ChevronRight, Play, Mic, Users, Phone } from 'lucide-react'
import { api, CreateScheduledCallData } from '../lib/api'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import { AnalogClock } from '../components/AnalogClock'
import { PhoneInput } from '../components/PhoneInput'
import { formatPhoneDisplay } from '../lib/phone'

export function Schedule() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const templateId = (location.state as { templateId?: string })?.templateId

  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedHour, setSelectedHour] = useState(9)
  const [selectedMinute, setSelectedMinute] = useState(0)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [phoneNumber, setPhoneNumber] = useState('')
  const [contactId, setContactId] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [machineDetection, setMachineDetection] = useState('DetectMessageEnd')
  const [machineDetectionTimeout, setMachineDetectionTimeout] = useState(30)
  const [postBeepDelay, setPostBeepDelay] = useState(0)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrencePattern, setRecurrencePattern] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [callImmediately, setCallImmediately] = useState(false)

  const { data: recordings } = useQuery({
    queryKey: ['recordings'],
    queryFn: api.recordings.list,
  })

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.contacts.list(),
  })

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  // Load template if specified
  useEffect(() => {
    if (templateId && templates) {
      const template = templates.find((t) => t.id === templateId)
      if (template) {
        if (template.recordingId) setRecordingId(template.recordingId)
        if (template.contactId) {
          setContactId(template.contactId)
          const contact = contacts?.find((c) => c.id === template.contactId)
          if (contact) setPhoneNumber(contact.phoneNumber)
        }
        setMachineDetection(template.machineDetection || 'DetectMessageEnd')
        setMachineDetectionTimeout(template.machineDetectionTimeout ?? 30)
        setPostBeepDelay(template.postBeepDelay ?? 0)
      }
    }
  }, [templateId, templates, contacts])

  const scheduleMutation = useMutation({
    mutationFn: api.calls.scheduled.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] })
      toast.success('Call scheduled')
      navigate('/queue')
    },
    onError: (error) => toast.error(error.message),
  })

  const handleContactSelect = (id: string) => {
    setContactId(id)
    const contact = contacts?.find((c) => c.id === id)
    if (contact) setPhoneNumber(contact.phoneNumber)
  }

  const handleSchedule = (triggerNow = false) => {
    if (!recordingId) {
      toast.error('Please select a recording')
      return
    }
    if (!phoneNumber) {
      toast.error('Please enter a phone number or select a contact')
      return
    }

    // For immediate calls, use current time; otherwise require a date
    const scheduledAt = triggerNow || callImmediately
      ? new Date()
      : selectedDate
        ? (() => {
            const d = new Date(selectedDate)
            d.setHours(selectedHour, selectedMinute, 0, 0)
            return d
          })()
        : null

    if (!scheduledAt) {
      toast.error('Please select a date')
      return
    }

    const data: CreateScheduledCallData & { triggerImmediately?: boolean } = {
      phoneNumber,
      contactId,
      recordingId,
      scheduledAt: scheduledAt.toISOString(),
      machineDetection,
      machineDetectionTimeout,
      postBeepDelay,
      recurrenceEnabled: isRecurring,
      recurrencePattern: isRecurring ? recurrencePattern : null,
      triggerImmediately: triggerNow || callImmediately,
    }

    scheduleMutation.mutate(data)
  }

  // Calendar generation
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPadding = monthStart.getDay()
  const paddedDays = [...Array(startPadding).fill(null), ...days]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schedule Call</h1>
        <p className="text-gray-500">Set up a new scheduled phone call</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column - Date & Time */}
        <div className="space-y-6">
          {/* Calendar */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-400" />
                Select Date
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="py-2 text-gray-500 font-medium">{day}</div>
              ))}
              {paddedDays.map((day, i) => (
                <button
                  key={i}
                  onClick={() => day && !isBefore(day, startOfDay(new Date())) && setSelectedDate(day)}
                  disabled={!day || isBefore(day, startOfDay(new Date()))}
                  className={clsx(
                    'py-2 rounded-lg transition-colors',
                    !day && 'invisible',
                    day && isBefore(day, startOfDay(new Date())) && 'text-gray-300 cursor-not-allowed',
                    day && !isBefore(day, startOfDay(new Date())) && 'hover:bg-gray-100',
                    day && isToday(day) && 'ring-2 ring-primary-500',
                    day && selectedDate && isSameDay(day, selectedDate) && 'bg-primary-600 text-white hover:bg-primary-700'
                  )}
                >
                  {day?.getDate()}
                </button>
              ))}
            </div>
          </div>

          {/* Time Picker with Analog Clock */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-gray-400" />
              Select Time (24-hour)
            </h2>

            <div className="flex items-start gap-6">
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Hour</label>
                    <select
                      value={selectedHour}
                      onChange={(e) => setSelectedHour(parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Minute</label>
                    <select
                      value={selectedMinute}
                      onChange={(e) => setSelectedMinute(parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    >
                      {Array.from({ length: 60 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Analog Clock */}
              <div className="flex-shrink-0">
                <AnalogClock hour={selectedHour} minute={selectedMinute} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Call Settings */}
        <div className="space-y-6">
          {/* Contact/Phone */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-gray-400" />
              Recipient
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Select Contact</label>
                <select
                  value={contactId || ''}
                  onChange={(e) => e.target.value ? handleContactSelect(e.target.value) : setContactId(null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">-- Enter phone manually --</option>
                  {contacts?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({formatPhoneDisplay(c.phoneNumber)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Phone Number</label>
                <PhoneInput
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                />
              </div>
            </div>
          </div>

          {/* Recording */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold flex items-center gap-2 mb-4">
              <Mic className="w-5 h-5 text-gray-400" />
              Recording
            </h2>

            <select
              value={recordingId || ''}
              onChange={(e) => setRecordingId(e.target.value || null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">-- Select a recording --</option>
              {recordings?.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Recurring */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="font-medium">Recurring call</span>
            </label>

            {isRecurring && (
              <div className="mt-4">
                <label className="block text-sm text-gray-500 mb-1">Cron Pattern</label>
                <input
                  type="text"
                  value={recurrencePattern}
                  onChange={(e) => setRecurrencePattern(e.target.value)}
                  placeholder="0 9 15 * *  (9am on 15th of each month)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Format: minute hour day month weekday
                </p>
              </div>
            )}
          </div>

          {/* Advanced Options */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50"
            >
              <span className="font-medium">Advanced Twilio Options</span>
              <ChevronRight className={clsx('w-5 h-5 transition-transform', showAdvanced && 'rotate-90')} />
            </button>

            {showAdvanced && (
              <div className="p-4 pt-0 space-y-4 border-t">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Machine Detection</label>
                  <select
                    value={machineDetection}
                    onChange={(e) => setMachineDetection(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="DetectMessageEnd">Detect Message End (Recommended)</option>
                    <option value="Enable">Enable</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Detection Timeout (s)</label>
                    <input
                      type="number"
                      value={isNaN(machineDetectionTimeout) ? 30 : machineDetectionTimeout}
                      onChange={(e) => setMachineDetectionTimeout(parseInt(e.target.value) || 30)}
                      min={2}
                      max={60}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Post-Beep Delay (s)</label>
                    <input
                      type="number"
                      value={isNaN(postBeepDelay) ? 0 : postBeepDelay}
                      onChange={(e) => setPostBeepDelay(parseFloat(e.target.value) || 0)}
                      min={0}
                      max={10}
                      step={0.5}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleSchedule(false)}
              disabled={scheduleMutation.isPending || !selectedDate || !recordingId || !phoneNumber}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Calendar className="w-5 h-5" />
              {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule'}
            </button>
            <button
              onClick={() => handleSchedule(true)}
              disabled={scheduleMutation.isPending || !recordingId || !phoneNumber}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Phone className="w-5 h-5" />
              {scheduleMutation.isPending ? 'Calling...' : 'Call Now'}
            </button>
          </div>

          {/* Summary */}
          {selectedDate && !callImmediately && (
            <div className="bg-primary-50 rounded-xl p-4">
              <p className="text-sm text-primary-800">
                <strong>Scheduled for:</strong>{' '}
                {format(selectedDate, 'EEEE, MMMM d, yyyy')} at {selectedHour.toString().padStart(2, '0')}:{selectedMinute.toString().padStart(2, '0')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
