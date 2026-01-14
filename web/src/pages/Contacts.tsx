import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Edit2, Trash2, X, Check, Phone, FileText } from 'lucide-react'
import { api, Contact } from '../lib/api'
import { toast } from 'sonner'
import { PhoneInput } from '../components/PhoneInput'
import { formatPhoneDisplay } from '../lib/phone'

export function Contacts() {
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phoneNumber: '', notes: '' })
  const [search, setSearch] = useState('')

  const queryClient = useQueryClient()

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => api.contacts.list(search || undefined),
  })

  const createMutation = useMutation({
    mutationFn: api.contacts.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setShowAdd(false)
      setForm({ name: '', phoneNumber: '', notes: '' })
      toast.success('Contact created')
    },
    onError: (error) => toast.error(error.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      api.contacts.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setEditingId(null)
      toast.success('Contact updated')
    },
    onError: (error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: api.contacts.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('Contact deleted')
    },
    onError: (error) => toast.error(error.message),
  })

  const startEditing = (contact: Contact) => {
    setEditingId(contact.id)
    setForm({ name: contact.name, phoneNumber: contact.phoneNumber, notes: contact.notes || '' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500">Manage your phone contacts</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contacts..."
        className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
      />

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add Contact</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone Number</label>
                <PhoneInput
                  value={form.phoneNumber}
                  onChange={(val) => setForm({ ...form, phoneNumber: val })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
        </div>
      ) : contacts?.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts yet</h3>
          <p className="text-gray-500">Add your first contact to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {contacts?.map((contact) => (
            <div key={contact.id} className="p-4 flex items-center gap-4">
              <div className="p-3 bg-primary-100 text-primary-600 rounded-full">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1">
                {editingId === contact.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-1 border rounded focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <PhoneInput
                      value={form.phoneNumber}
                      onChange={(val) => setForm({ ...form, phoneNumber: val })}
                    />
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-gray-900">{contact.name}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3" />
                        {formatPhoneDisplay(contact.phoneNumber)}
                      </span>
                      {contact.notes && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {contact.notes.slice(0, 50)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingId === contact.id ? (
                  <>
                    <button
                      onClick={() => updateMutation.mutate({ id: contact.id, data: form })}
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
                      onClick={() => startEditing(contact)}
                      className="p-2 text-gray-400 hover:bg-gray-100 rounded"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => confirm('Delete contact?') && deleteMutation.mutate(contact.id)}
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
