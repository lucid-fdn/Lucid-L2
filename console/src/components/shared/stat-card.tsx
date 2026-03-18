import { Card, CardContent } from '@/components/ui/card'

export function StatCard({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <p className="text-sm text-zinc-400">{label}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}
