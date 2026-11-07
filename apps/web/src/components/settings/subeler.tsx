'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/design-system/state-views';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { Branch } from '@/lib/api-types';

/** Şubeler — branch.manage izni olanlar ekleyebilir/düzenleyebilir. */
export function Subeler() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('branch.manage');
  const [createOpen, setCreateOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', code: '', address: '' });

  const query = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/branches'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; code: string; address?: string }) =>
      api<Branch>('/branches', { method: 'POST', body: payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      setCreateOpen(false);
      setNewBranch({ name: '', code: '', address: '' });
      toast({ title: 'Şube oluşturuldu', description: 'Denetim kaydına yazıldı.' });
    },
    onError: (error: Error) => toast({ title: 'Şube oluşturulamadı', description: error.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<Branch>(`/branches/${id}`, { method: 'PATCH', body: { active } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['branches'] }),
    onError: (error: Error) => toast({ title: 'Şube güncellenemedi', description: error.message, variant: 'destructive' }),
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({
      name: newBranch.name,
      code: newBranch.code.toUpperCase(),
      address: newBranch.address || undefined,
    });
  }

  if (query.isLoading) return <Skeleton className="h-72" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Şubeler yüklenemedi"
        description={query.error instanceof Error ? query.error.message : 'Bilinmeyen hata'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const branches = query.data ?? [];

  return (
    <Card data-testid="branches-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Şubeler</CardTitle>
          <CardDescription>Klinik şubeleri ve durumları.</CardDescription>
        </div>
        {canManage ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-11">
                <Plus className="size-4" /> Yeni şube
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni şube</DialogTitle>
              </DialogHeader>
              <form onSubmit={onCreate} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="branch-name">Şube adı</Label>
                  <Input id="branch-name" required minLength={2} value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="branch-code">Şube kodu</Label>
                  <Input id="branch-code" required minLength={2} maxLength={8} placeholder="örn. SUB3" value={newBranch.code} onChange={(e) => setNewBranch({ ...newBranch, code: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="branch-address">Adres</Label>
                  <Input id="branch-address" value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    Oluştur
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {branches.length === 0 ? (
          <EmptyState
            title="Henüz şube yok"
            description="İlk şubeyi oluşturarak başlayın."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Şube</TableHead>
                <TableHead>Kod</TableHead>
                <TableHead>Adres</TableHead>
                <TableHead>Durum</TableHead>
                {canManage ? <TableHead className="text-right">Etkin</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell className="font-medium">
                    {branch.name}
                    {branch.isPrimary ? (
                      <Badge variant="secondary" className="ml-2">Ana şube</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell><code className="text-xs">{branch.code}</code></TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{branch.address ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={branch.active ? 'default' : 'outline'}>
                      {branch.active ? 'Etkin' : 'Pasif'}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Switch
                        checked={branch.active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: branch.id, active: checked })}
                        aria-label={`${branch.name} etkinlik durumu`}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
