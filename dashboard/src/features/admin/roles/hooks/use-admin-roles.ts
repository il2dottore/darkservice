import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignPermissionToRole,
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  fetchPermissions,
  fetchRoleByKey,
  fetchRoles,
  removePermissionFromRole,
  updatePermission,
  updateRole,
} from '@/services/admin/roles/role.service'
import { compact, uniq } from 'lodash-es'

/* ───── Roles ───── */

const rolesKey = ['admin', 'roles'] as const

export function useRoles() {
  return useQuery({
    queryKey: [...rolesKey, 'list'],
    queryFn: fetchRoles,
  })
}

export function useRoleByKey(roleKey: string | null) {
  return useQuery({
    queryKey: [...rolesKey, 'detail', roleKey],
    queryFn: () => fetchRoleByKey(roleKey!),
    enabled: roleKey !== null,
    select: (data) => {
      const perms = compact(data.map((row) => row.permissions?.key))
      return {
        role: data[0]?.roles ?? null,
        permissionIds: uniq(perms),
      }
    },
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      displayName,
      description,
    }: {
      key: string
      displayName: string
      description: string
    }) => createRole(key, displayName, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: rolesKey }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      displayName,
      description,
    }: {
      key: string
      displayName: string
      description: string
    }) => updateRole(key, displayName, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: rolesKey }),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => deleteRole(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: rolesKey }),
  })
}

/* ───── Role-Permission assignments ───── */

export function useAssignPermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      roleKey,
      permissionId,
    }: {
      roleKey: string
      permissionId: string
    }) => assignPermissionToRole(roleKey, permissionId),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: [...rolesKey, 'detail', vars.roleKey] }),
  })
}

export function useRemovePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      roleKey,
      permissionId,
    }: {
      roleKey: string
      permissionId: string
    }) => removePermissionFromRole(roleKey, permissionId),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: [...rolesKey, 'detail', vars.roleKey] }),
  })
}

/* ───── Permissions ───── */

const permissionsKey = ['admin', 'permissions'] as const

export function usePermissions() {
  return useQuery({
    queryKey: permissionsKey,
    queryFn: fetchPermissions,
  })
}

export function useCreatePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      key,
      displayName,
      description,
    }: {
      key: string
      displayName: string
      description: string
    }) => createPermission(key, displayName, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: permissionsKey }),
  })
}

export function useUpdatePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      newId,
      displayName,
      description,
    }: {
      id: string
      newId: string
      displayName: string
      description: string
    }) => updatePermission(id, newId, displayName, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: permissionsKey }),
  })
}

export function useDeletePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePermission(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: permissionsKey }),
  })
}
