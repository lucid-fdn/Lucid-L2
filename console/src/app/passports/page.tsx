'use client'

import { useState, useCallback, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { lucidGet, lucidPost } from '@/lib/api'
import { StatusDot } from '@/components/shared/status-dot'
import { DataTable, type Column } from '@/components/shared/data-table'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorBanner } from '@/components/shared/error-banner'
import { TimeAgo } from '@/components/shared/time-ago'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Passport {
  id: string
  name: string
  type: 'model' | 'compute' | 'tool' | 'agent' | 'dataset'
  status: 'active' | 'deprecated' | 'revoked'
  created_at: string
  metadata: Record<string, unknown>
}

interface PassportListResponse {
  success: boolean
  passports: Passport[]
}

interface PassportCreateResponse {
  success: boolean
  passport: Passport
}

type PassportType = Passport['type']
type PassportStatus = Passport['status']

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASSPORT_TYPES: PassportType[] = ['model', 'compute', 'tool', 'agent', 'dataset']
const PASSPORT_STATUSES: PassportStatus[] = ['active', 'deprecated', 'revoked']

const typeBadgeClasses: Record<PassportType, string> = {
  model: 'bg-blue-900/50 text-blue-300',
  compute: 'bg-purple-900/50 text-purple-300',
  tool: 'bg-amber-900/50 text-amber-300',
  agent: 'bg-emerald-900/50 text-emerald-300',
  dataset: 'bg-pink-900/50 text-pink-300',
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PassportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PassportsPage() {
  const router = useRouter()

  // --- data state ---
  const [passports, setPassports] = useState<Passport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- filter state ---
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // --- create dialog state ---
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createType, setCreateType] = useState<string>('model')
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')

  // --- fetch ---
  const fetchPassports = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const qs = params.toString()
      const data = await lucidGet<PassportListResponse>(`/v1/passports${qs ? `?${qs}` : ''}`)
      setPassports(data.passports)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load passports')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, statusFilter])

  useEffect(() => {
    setLoading(true)
    fetchPassports()
  }, [fetchPassports])

  // --- create handler ---
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      await lucidPost<PassportCreateResponse>('/v1/passports', {
        type: createType,
        name: createName,
        metadata: createDescription ? { description: createDescription } : undefined,
      })
      setDialogOpen(false)
      setCreateName('')
      setCreateDescription('')
      setCreateType('model')
      await fetchPassports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create passport')
    } finally {
      setCreating(false)
    }
  }

  // --- columns ---
  const columns: Column<Passport>[] = [
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusDot status={row.status} />,
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => <span className="font-semibold text-zinc-100">{row.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge className={typeBadgeClasses[row.type]}>{row.type}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row) => <TimeAgo date={row.created_at} />,
    },
  ]

  // --- render ---
  if (loading) return <PassportsSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Passports</h2>
        <div className="flex items-center gap-2">
          {/* Type filter */}
          <Select
            value={typeFilter}
            onValueChange={(v) => { if (v !== null) setTypeFilter(v) }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {PASSPORT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => { if (v !== null) setStatusFilter(v) }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PASSPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Create button */}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchPassports} />}

      {/* Table or empty */}
      {passports.length === 0 ? (
        <EmptyState title="No passports yet" description="Create your first passport to get started." />
      ) : (
        <DataTable<Passport & Record<string, unknown>>
          columns={columns as Column<Passport & Record<string, unknown>>[]}
          data={passports as (Passport & Record<string, unknown>)[]}
          onRowClick={(row) => router.push(`/passports/${row.id}`)}
        />
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Passport</DialogTitle>
            <DialogDescription>
              Register a new AI asset in the Lucid network.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-type">Type</Label>
              <Select
                value={createType}
                onValueChange={(v) => { if (v !== null) setCreateType(v) }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PASSPORT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                placeholder="e.g. gpt-4o-mini"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-desc">Description</Label>
              <Textarea
                id="create-desc"
                placeholder="Optional description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating || !createName.trim()}>
                {creating ? 'Creating...' : 'Create Passport'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
