import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Edit2, Trash2, Copy, Play, Mic, Users } from 'lucide-react'
import { api, Template, CreateTemplateData } from '../lib/api'
import { toast } from 'sonner'
import { formatPhoneDisplay } from '../lib/phone'

export function Templates() {
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: api.templates.list,
  })

  const { data: recordings } = useQuery({
    queryKey: ['recordings'],
    queryFn: api.recordings.list,
  })

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.contacts.list(),
  })

  const createMutation = useMutation({
    mutationFn: api.templates.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowForm(false)
      toast.success('Template created')
    },
    onError: (error) => toast.error(error.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTemplateData> }) =>
      api.templates.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setEditingTemplate(null)
      toast.success('Template updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: api.templates.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template deleted')
    },
    onError: (error) => toast.error(error.message),
  })

  const cloneMutation = useMutation({
    mutationFn: api.templates.clone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template cloned')
    },
    onError: (error) => toast.error(error.message),
  })

  const useTemplate = (template: Template) => {
    navigate('/schedule', { state: { templateId: template.id } })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-500">Pre-configured call settings for quick scheduling</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Form Modal */}
      {(showForm || editingTemplate) && (
        <TemplateForm
          template={editingTemplate}
          recordings={recordings || []}
          contacts={contacts || []}
          onSubmit={(data) => {
            if (editingTemplate) {
              updateMutation.mutate({ id: editingTemplate.id, data })
            } else {
              createMutation.mutate(data)
            }
          }}
          onCancel={() => {
            setShowForm(false)
            setEditingTemplate(null)
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Templates List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : templates?.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No templates yet</h3>
          <p className="text-gray-500">Create a template to save your call settings</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates?.map((template) => (
            <div key={template.id} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-primary-100 text-primary-600 rounded-lg">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => cloneMutation.mutate(template.id)}
                    className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => confirm('Delete template?') && deleteMutation.mutate(template.id)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
              {template.description && (
                <p className="text-sm text-gray-500 mb-3">{template.description}</p>
              )}

              <div className="space-y-2 text-sm text-gray-600 mb-4">
                {template.recording && (
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-gray-400" />
                    {template.recording.name}
                  </div>
                )}
                {template.contact && (
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    {template.contact.name}
                  </div>
                )}
                <div className="text-xs text-gray-400">
                  AMD: {template.machineDetection} | Delay: {template.postBeepDelay}s
                </div>
              </div>

              <button
                onClick={() => useTemplate(template)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100"
              >
                <Play className="w-4 h-4" />
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateForm({
  template,
  recordings,
  contacts,
  onSubmit,
  onCancel,
  isLoading,
}: {
  template: Template | null
  recordings: { id: string; name: string }[]
  contacts: { id: string; name: string; phoneNumber: string }[]
  onSubmit: (data: CreateTemplateData) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [form, setForm] = useState<CreateTemplateData>({
    name: template?.name || '',
    description: template?.description || '',
    recordingId: template?.recordingId || null,
    contactId: template?.contactId || null,
    machineDetection: template?.machineDetection || 'DetectMessageEnd',
    machineDetectionTimeout: template?.machineDetectionTimeout || 30,
    postBeepDelay: template?.postBeepDelay || 0,
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">
          {template ? 'Edit Template' : 'New Template'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Default Recording</label>
            <select
              value={form.recordingId || ''}
              onChange={(e) => setForm({ ...form, recordingId: e.target.value || null })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">None</option>
              {recordings.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Default Contact</label>
            <select
              value={form.contactId || ''}
              onChange={(e) => setForm({ ...form, contactId: e.target.value || null })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({formatPhoneDisplay(c.phoneNumber)})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Machine Detection</label>
            <select
              value={form.machineDetection}
              onChange={(e) => setForm({ ...form, machineDetection: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="DetectMessageEnd">Detect Message End (Recommended)</option>
              <option value="Enable">Enable</option>
              <option value="Disabled">Disabled</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Detection Timeout (s)</label>
              <input
                type="number"
                value={form.machineDetectionTimeout}
                onChange={(e) => setForm({ ...form, machineDetectionTimeout: parseInt(e.target.value) || 30 })}
                min={2}
                max={60}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Post-Beep Delay (s)</label>
              <input
                type="number"
                value={form.postBeepDelay}
                onChange={(e) => setForm({ ...form, postBeepDelay: parseFloat(e.target.value) || 0 })}
                min={0}
                max={10}
                step={0.5}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={isLoading || !form.name}
            className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
