'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState, UnauthorizedState } from '@/components/design-system/state-views';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import type { Permission, Role } from '@/lib/api-types';

/**
 * Roller ve izin matrisi — roles.manage izniyle düzenlenebilir.
 * Her hücre değişimi PUT /roles/:id/permissions ile yazılır ve denetim kaydına
 * before/after ile işlenir. Sistem şablonları da düzenlenebilir (isSystem yalnız
 * bilgi amaçlı bir işarettir).
 */
export function Roller() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManage = hasPermission('roles.manage');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', key: '', description: '' });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<Role[]>('/roles'),
  });
  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<Permission[]>('/permissions'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; key: string; description?: string }) =>
      api<Role>('/roles', { method: 'POST', body: payload }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      setCreateOpen(false);
      setForm({ name: '', key: '', description: '' });
      toast({ title: 'Rol oluşturuldu', description: 'Denetim kaydına yazıldı.' });
    },
    onError: (error: Error) =>
      toast({ title: 'Rol oluşturulamadı', description: error.message, variant: 'destructive' }),
  });

  const matrixMutation = useMutation({
    mutationFn: ({ roleId, permissionKeys }: { roleId: string; permissionKeys: string[] }) =>
      api<Role>(`/roles/${roleId}/permissions`, { method: 'PUT', body: { permissionKeys } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast({
        title: 'İzin matrisi güncellendi',
        description: 'Değişiklik denetim kaydına yazıldı.',
      });
    },
    onError: (error: Error) =>
      toast({ title: 'Matris güncellenemedi', description: error.message, variant: 'destructive' }),
  });

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of permissionsQuery.data ?? []) {
      const list = groups.get(permission.group) ?? [];
      list.push(permission);
      groups.set(permission.group, list);
    }
    return [...groups.entries()];
  }, [permissionsQuery.data]);

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({
      name: form.name,
      key: form.key.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      description: form.description || undefined,
    });
  }

  function togglePermission(role: Role, permissionKey: string) {
    const current = role.rolePermissions.map((rp) => rp.permissionKey);
    const next = current.includes(permissionKey)
      ? current.filter((key) => key !== permissionKey)
      : [...current, permissionKey];
    matrixMutation.mutate({ roleId: role.id, permissionKeys: next });
  }

  if (!canManage) {
    return (
      <UnauthorizedState
        title="Rol yönetimi yetkiniz yok"
        description="İzin matrisini görüntülemek ve düzenlemek için roles.manage izni gerekir."
      />
    );
  }

  if (rolesQuery.isLoading || permissionsQuery.isLoading) return <Skeleton className="h-80" />;
  if (rolesQuery.isError) {
    return (
      <ErrorState
        title="Roller yüklenemedi"
        description={
          rolesQuery.error instanceof Error ? rolesQuery.error.message : 'Bilinmeyen hata'
        }
        onRetry={() => void rolesQuery.refetch()}
      />
    );
  }

  const roles = rolesQuery.data ?? [];

  return (
    <Card data-testid="roles-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Roller ve İzinler</CardTitle>
          <CardDescription>
            İzin matrisi — her değişiklik anında etkinleşir ve denetim kaydına yazılır.
          </CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="min-h-11">
              <Plus className="size-4" /> Yeni rol
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni rol</DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-name">Rol adı</Label>
                <Input
                  id="role-name"
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-key">Anahtar (tekil)</Label>
                <Input
                  id="role-key"
                  required
                  minLength={2}
                  maxLength={40}
                  placeholder="örn. hizmet-muduru"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role-desc">Açıklama</Label>
                <Input
                  id="role-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Oluştur
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card">Rol</TableHead>
              {permissionGroups.map(([group, permissions]) => (
                <TableHead key={group} colSpan={permissions.length} className="text-center">
                  <span className="capitalize">{group}</span>
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              <TableHead className="sticky left-0 bg-card" />
              {permissionGroups.map(([group, permissions]) =>
                permissions.map((permission) => (
                  <TableHead key={permission.key} className="text-center">
                    <span
                      title={permission.description ?? permission.name}
                      className="text-[11px] font-normal"
                    >
                      {permission.key}
                    </span>
                  </TableHead>
                )),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id} data-testid={`role-row-${role.key}`}>
                <TableCell className="sticky left-0 bg-card">
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5 font-medium">
                      {role.name}
                      {role.isSystem ? <Badge variant="secondary">şablon</Badge> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {role.description ?? role.key}
                      {role.allBranches ? ' · tüm şubeler' : ''}
                    </span>
                  </div>
                </TableCell>
                {permissionGroups.map(([, permissions]) =>
                  permissions.map((permission) => {
                    const enabled = role.rolePermissions.some(
                      (rp) => rp.permissionKey === permission.key,
                    );
                    return (
                      <TableCell key={permission.key} className="text-center">
                        <Switch
                          checked={enabled}
                          disabled={matrixMutation.isPending}
                          onCheckedChange={() => togglePermission(role, permission.key)}
                          aria-label={`${role.name} — ${permission.key}`}
                        />
                      </TableCell>
                    );
                  }),
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <KeyRound className="size-3.5" aria-hidden="true" />
          İzinler oturum açılışında değil her istekte canlı okunur; değişiklik anında geçerlidir.
        </p>
      </CardContent>
    </Card>
  );
}
