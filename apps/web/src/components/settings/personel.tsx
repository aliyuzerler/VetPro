'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, RefreshCw, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, UnauthorizedState } from '@/components/design-system/state-views';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { Branch, Role, StaffMember } from '@/lib/api-types';

/** Personel yönetimi — staff.manage izni gerektirir. */
export function Personel() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('staff.manage');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', firstName: '', lastName: '', title: '',
    roleIds: [] as string[], branchIds: [] as string[],
  });

  const staffQuery = useQuery({
    queryKey: ['staff'],
    queryFn: () => api<StaffMember[]>('/staff'),
    enabled: canManage,
  });
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<Role[]>('/roles'),
    enabled: canManage && createOpen,
  });
  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/branches'),
    enabled: canManage && createOpen,
  });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      api<StaffMember>('/staff', {
        method: 'POST',
        body: { ...payload, title: payload.title || undefined },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      setCreateOpen(false);
      setForm({ email: '', password: '', firstName: '', lastName: '', title: '', roleIds: [], branchIds: [] });
      toast({ title: 'Personel oluşturuldu', description: 'Denetim kaydına yazıldı.' });
    },
    onError: (error: Error) => toast({ title: 'Personel oluşturulamadı', description: error.message, variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<StaffMember>(`/staff/${id}`, { method: 'PATCH', body: { active } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['staff'] }),
    onError: (error: Error) => toast({ title: 'Personel güncellenemedi', description: error.message, variant: 'destructive' }),
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate(form);
  }

  function toggleIn(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  if (!canManage) {
    return (
      <UnauthorizedState
        title="Personel yönetimi yetkiniz yok"
        description="Personel listesi ve atamalar için staff.manage izni gerekir."
      />
    );
  }

  if (staffQuery.isLoading) return <Skeleton className="h-72" />;
  if (staffQuery.isError) {
    return (
      <ErrorState
        title="Personel yüklenemedi"
        description={staffQuery.error instanceof Error ? staffQuery.error.message : 'Bilinmeyen hata'}
        onRetry={() => void staffQuery.refetch()}
      />
    );
  }

  const staff = staffQuery.data ?? [];

  return (
    <Card data-testid="staff-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Personel</CardTitle>
          <CardDescription>Personel hesapları, roller ve şube atamaları.</CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="min-h-11">
              <Plus className="size-4" /> Yeni personel
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Yeni personel</DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="staff-first">Ad</Label>
                  <Input id="staff-first" required minLength={2} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="staff-last">Soyad</Label>
                  <Input id="staff-last" required minLength={2} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="staff-email">E-posta</Label>
                <Input id="staff-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="staff-pass">Parola</Label>
                  <Input id="staff-pass" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="staff-title">Unvan</Label>
                  <Input id="staff-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="örn. Veteriner Hekim" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Roller</Label>
                {(rolesQuery.data ?? []).map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.roleIds.includes(role.id)}
                      onCheckedChange={() => setForm({ ...form, roleIds: toggleIn(form.roleIds, role.id) })}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Şubeler</Label>
                {(branchesQuery.data ?? []).map((branch) => (
                  <label key={branch.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.branchIds.includes(branch.id)}
                      onCheckedChange={() => setForm({ ...form, branchIds: toggleIn(form.branchIds, branch.id) })}
                    />
                    {branch.name}
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || form.roleIds.length === 0 || form.branchIds.length === 0}>
                  {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Oluştur
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {staff.length === 0 ? (
          <EmptyState title="Henüz personel yok" description="İlk personeli ekleyin." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Personel</TableHead>
                <TableHead>Roller</TableHead>
                <TableHead>Şubeler</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.id} data-testid={`staff-row-${member.email}`}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{member.firstName} {member.lastName}</span>
                      <span className="text-xs text-muted-foreground">{member.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {member.staffRoles.map((sr) => (
                        <Badge key={sr.role.id} variant="secondary">{sr.role.name}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {member.staffBranches.map((sb) => (
                        <Badge key={sb.branch.id} variant="outline">{sb.branch.code}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.active ? 'default' : 'outline'}>
                      {member.active ? 'Etkin' : 'Pasif'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9"
                      onClick={() => toggleActive.mutate({ id: member.id, active: !member.active })}
                    >
                      {member.active ? 'Pasifleştir' : 'Etkinleştir'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
