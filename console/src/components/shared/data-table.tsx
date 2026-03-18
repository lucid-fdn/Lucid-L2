'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  keyField?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  keyField = 'id',
}: DataTableProps<T>) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          {columns.map((col) => (
            <TableHead key={col.key} className="text-zinc-400">{col.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow
            key={String(row[keyField] ?? i)}
            onClick={() => onRowClick?.(row)}
            className={onRowClick ? 'cursor-pointer hover:bg-zinc-900' : ''}
          >
            {columns.map((col) => (
              <TableCell key={col.key}>
                {col.render ? col.render(row) : String(row[col.key] ?? '')}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
