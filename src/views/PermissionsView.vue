<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { permissionsApi, rolesApi, type PermissionOption, type RoleOption } from '@/api/roles';

const permissions = ref<PermissionOption[]>([]);
const roles = ref<RoleOption[]>([]);
const loading = ref(true);
const err = ref<string | null>(null);

const usedByRoles = computed(() => {
  const map = new Map<string, string[]>();
  for (const role of roles.value) {
    for (const code of role.permissionCodes) {
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push(role.name);
    }
  }
  return map;
});

async function load() {
  loading.value = true;
  err.value = null;
  try {
    [permissions.value, roles.value] = await Promise.all([
      permissionsApi.list(),
      rolesApi.list(),
    ]);
  } catch {
    err.value = 'Failed to load permissions.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Permissions</h2>
        <p class="ares-page-subtitle">Platform permission codes. Defined by the system, assignable to roles.</p>
      </div>
    </div>

    <p v-if="err" style="color:var(--ares-error); margin-bottom:1rem;">{{ err }}</p>

    <div v-if="loading" class="ares-table-empty">Loading…</div>
    <div v-else class="ares-table-wrap">
      <table class="ares-table">
        <thead>
          <tr>
            <th style="width:220px;">Code</th>
            <th>Description</th>
            <th style="width:280px;">Assigned to roles</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="perm in permissions" :key="perm.id">
            <td>
              <code style="font-size:0.78rem; font-family:monospace;">{{ perm.code }}</code>
            </td>
            <td style="color:var(--ares-text-muted); font-size:0.82rem;">{{ perm.description ?? '—' }}</td>
            <td>
              <span style="display:flex; flex-wrap:wrap; gap:0.25rem;">
                <span
                  v-for="role in (usedByRoles.get(perm.code) ?? [])"
                  :key="role"
                  style="font-size:0.67rem; padding:0.1rem 0.35rem; border-radius: var(--ares-radius);
                         background:var(--ares-surface); border:1px solid var(--ares-border); color:var(--ares-text-muted);"
                >{{ role }}</span>
                <span v-if="!usedByRoles.get(perm.code)?.length" style="color:var(--ares-text-muted); font-size:0.78rem;">—</span>
              </span>
            </td>
          </tr>
          <tr v-if="!permissions.length">
            <td colspan="3" class="ares-table-empty">No permissions defined.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
