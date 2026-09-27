<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { organizationsApi, type Organization, type SlaSettings } from '@/api/organizations';
import { organizationContactsApi, type OrganizationContact } from '@/api/organizationContacts';
import { severityToPriorityLabel } from '@/utils/cvss';
import { usersApi, type UserSummary } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { useContextStore } from '@/stores/context';

// Replaces the old EditOrgModal — same fields/behavior, now a real page instead of a dialog.
// Logo upload used to live on ClientDetailView's own header avatar, but that page now always
// titles "Dashboard" (org identity moved into the ORG_INFO_STRIP dashboard widget) — this is the
// only place left to change it.
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const toast = useToast();
const context = useContextStore();

const orgId = computed(() => Number(route.params.orgId));

const activeTab = computed({
  get: () => (typeof route.query.tab === 'string' ? route.query.tab : 'general'),
  set: (tab: string) => router.replace({ query: { ...route.query, tab } }),
});

const org = ref<Organization | null>(null);
const loading = ref(true);
const saving = ref(false);
const err = ref('');

const name = ref('');
const sla = ref<SlaSettings>({ critical: 7, high: 30, medium: 90, low: 180, info: 0 });

// Logo upload
const logoInput = ref<HTMLInputElement | null>(null);
const logoUploading = ref(false);

async function onLogoSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !org.value) return;
  logoUploading.value = true;
  try {
    await organizationsApi.uploadLogo(org.value.id, file);
    org.value = { ...org.value, hasLogo: true };
    context.setOrg({ id: org.value.id, name: org.value.name, slug: org.value.slug, hasLogo: true });
    toast.add({ severity: 'success', summary: 'Logo updated', life: 3000 });
  } catch {
    toast.add({ severity: 'error', summary: 'Failed to upload logo', life: 5000 });
  } finally {
    logoUploading.value = false;
    if (logoInput.value) logoInput.value.value = '';
  }
}

type OrgOperator = { userId: number; roleId: number; roleCode: string; roleName: string; email: string; displayName: string };
const operators = ref<OrgOperator[]>([]);
const allUsers = ref<UserSummary[]>([]);
const selectedNewUser = ref<UserSummary | null>(null);
const addingOperator = ref(false);
const operatorsLoading = ref(false);
const selectedNewClientUser = ref<UserSummary | null>(null);
const addingClientUser = ref(false);

const operatorRows = computed(() => operators.value.filter((o) => o.roleCode === 'MSSP_OPERATOR'));
const clientUserRows = computed(() => operators.value.filter((o) => o.roleCode === 'CLIENT_USER'));
const availableUsers = computed(() => {
  const assigned = new Set(operators.value.map((o) => o.userId));
  return allUsers.value.filter((u) => !assigned.has(u.id) && u.status === 'active');
});

async function load() {
  loading.value = true;
  try {
    org.value = await organizationsApi.get(orgId.value);
    name.value = org.value.name;
    sla.value = { ...org.value.sla };
  } finally {
    loading.value = false;
  }
  loadOperators();
  loadContacts();
}

async function loadOperators() {
  // Operator/Client-user management is MSSP-admin-only — CLIENT_ADMIN isn't granted
  // GET /organizations/{id}/operators at all, and both tabs are hidden for them anyway.
  if (!auth.isAdmin) return;
  operatorsLoading.value = true;
  try {
    operators.value = await organizationsApi.listOperators(orgId.value);
    const usersRes = await usersApi.list({ page: 0, size: 200 });
    allUsers.value = usersRes.items;
  } catch { /* silent */ }
  finally { operatorsLoading.value = false; }
}

async function addOperator() {
  if (!selectedNewUser.value) return;
  addingOperator.value = true;
  try {
    await organizationsApi.addOperator(orgId.value, selectedNewUser.value.id);
    await loadOperators();
    selectedNewUser.value = null;
    toast.add({ severity: 'success', summary: 'Operator added', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally { addingOperator.value = false; }
}

async function removeOperator(userId: number) {
  try {
    await organizationsApi.removeOperator(orgId.value, userId);
    operators.value = operators.value.filter((o) => o.userId !== userId);
    toast.add({ severity: 'success', summary: 'Operator removed', life: 3000 });
  } catch { toast.add({ severity: 'error', summary: 'Failed to remove operator', life: 4000 }); }
}

async function addClientUser() {
  if (!selectedNewClientUser.value) return;
  addingClientUser.value = true;
  try {
    await organizationsApi.addOperator(orgId.value, selectedNewClientUser.value.id, 'CLIENT_USER');
    await loadOperators();
    selectedNewClientUser.value = null;
    toast.add({ severity: 'success', summary: 'Client user added', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 4000 });
  } finally { addingClientUser.value = false; }
}

async function removeClientUser(userId: number) {
  try {
    await organizationsApi.removeOperator(orgId.value, userId, 'CLIENT_USER');
    operators.value = operators.value.filter((o) => o.userId !== userId);
    toast.add({ severity: 'success', summary: 'Client user removed', life: 3000 });
  } catch { toast.add({ severity: 'error', summary: 'Failed to remove client user', life: 4000 }); }
}

// Contacts — reusable named email recipients (e.g. "Ticketing") referenced by
// "email_recipients" Rules of Engagement to auto-populate a finding report's To/CC/BCC.
const contacts = ref<OrganizationContact[]>([]);
const contactsLoading = ref(false);
const newContactName = ref('');
const newContactEmail = ref('');
const addingContact = ref(false);

async function loadContacts() {
  if (!auth.isAdmin) return;
  contactsLoading.value = true;
  try {
    contacts.value = await organizationContactsApi.list(orgId.value);
  } catch { /* silent */ }
  finally { contactsLoading.value = false; }
}

async function addContact() {
  if (!newContactName.value.trim() || !newContactEmail.value.trim()) return;
  addingContact.value = true;
  try {
    const c = await organizationContactsApi.create(orgId.value, {
      name: newContactName.value.trim(), email: newContactEmail.value.trim(),
    });
    contacts.value = [...contacts.value, c].sort((a, b) => a.name.localeCompare(b.name));
    newContactName.value = '';
    newContactEmail.value = '';
    toast.add({ severity: 'success', summary: 'Contact added', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.detail ?? e.message, life: 4000 });
  } finally { addingContact.value = false; }
}

async function removeContact(id: number) {
  try {
    await organizationContactsApi.delete(orgId.value, id);
    contacts.value = contacts.value.filter((c) => c.id !== id);
    toast.add({ severity: 'success', summary: 'Contact removed', life: 3000 });
  } catch { toast.add({ severity: 'error', summary: 'Failed to remove contact', life: 4000 }); }
}

async function save() {
  if (!org.value || !name.value.trim()) return;
  saving.value = true;
  err.value = '';
  try {
    org.value = await organizationsApi.update(org.value.id, { name: name.value.trim(), sla: sla.value });
    toast.add({ severity: 'success', summary: 'Organization updated', life: 3000 });
  } catch (e: any) {
    err.value = e?.response?.data?.detail ?? e?.message ?? 'Failed to save';
  } finally { saving.value = false; }
}

onMounted(() => {
  // Nav-item visibility already hides this page from a plain CLIENT_USER, but the router's
  // org-level guard has no per-role distinction to block direct-URL access the way it does for
  // org-project-* routes (see router/index.ts's CLIENT_PROJECT_ALLOWED_ROUTES) — belt-and-braces.
  if (auth.isClient && !auth.isClientAdmin) {
    router.replace({ name: 'organization-detail', params: { id: orgId.value } });
    return;
  }
  load();
});
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title">Settings</h2>
        <p v-if="org" class="ares-page-subtitle">{{ org.name }}</p>
      </div>
    </div>

    <div v-if="loading" style="color:var(--ares-text-muted);">Loading…</div>
    <Tabs v-else v-model:value="activeTab">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab v-if="auth.isAdmin" value="operators">Operators</Tab>
        <Tab v-if="auth.isAdmin" value="clients">Client Users</Tab>
        <Tab v-if="auth.isAdmin" value="contacts">Contacts</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="general">
          <div style="display:flex; flex-direction:column; gap:1.25rem; max-width:520px;">
            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.4rem;">Logo</label>
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <div style="position:relative; flex-shrink:0;">
                  <div
                    style="width:52px; height:52px; border-radius: var(--ares-radius); overflow:hidden; background:var(--p-surface-700); display:flex; align-items:center; justify-content:center; cursor:pointer;"
                    title="Change logo"
                    @click="logoInput?.click()"
                  >
                    <img v-if="org?.hasLogo" :src="organizationsApi.logoUrl(org.id)" :alt="org.name"
                      style="width:100%; height:100%; object-fit:contain;" />
                    <i v-else class="pi pi-building" style="font-size:1.4rem; color:var(--ares-text-muted);" />
                  </div>
                  <div v-if="logoUploading" style="position:absolute; inset:0; background:rgba(0,0,0,0.4); border-radius: var(--ares-radius); display:flex; align-items:center; justify-content:center;">
                    <i class="pi pi-spin pi-spinner" style="color:#fff;" />
                  </div>
                  <input ref="logoInput" type="file" accept="image/*" style="display:none;" @change="onLogoSelected" />
                </div>
                <Button label="Change logo" size="small" severity="secondary" outlined @click="logoInput?.click()" />
              </div>
            </div>

            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.4rem;">Name *</label>
              <InputText v-model="name" class="w-full" maxlength="120" />
            </div>

            <div>
              <label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ares-text-muted); margin-bottom:0.2rem;">Resolution SLA (days from publication)</label>
              <p style="font-size:0.72rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">Set 0 for no limit on that severity.</p>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.65rem;">
                <div v-for="sev in (['critical','high','medium','low','info'] as const)" :key="sev">
                  <label style="display:block; font-size:0.75rem; font-weight:600; margin-bottom:0.25rem;"
                    :style="{ color: { critical:'#ef4444', high:'#f97316', medium:'#ca8a04', low:'#16a34a', info:'#60a5fa' }[sev] }">
                    {{ severityToPriorityLabel(sev) }}
                  </label>
                  <InputNumber v-model="sla[sev]" :min="0" :max="3650" show-buttons class="w-full" :input-style="{ width: '100%' }" />
                </div>
              </div>
            </div>

            <Message v-if="err" severity="error" :closable="false">{{ err }}</Message>

            <div style="display:flex; justify-content:flex-end; padding-top:0.5rem; border-top:1px solid var(--ares-border);">
              <Button v-if="auth.isAdmin || auth.isClientAdmin" label="Save" size="small" :loading="saving" :disabled="!name.trim()" @click="save" />
            </div>
          </div>
        </TabPanel>

        <TabPanel v-if="auth.isAdmin" value="operators">
          <p style="font-size:0.72rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">
            Operators assigned here can access Findings and Assets for this organization.
          </p>
          <div v-if="operatorsLoading" style="font-size:0.8rem; color:var(--ares-text-muted); margin-bottom:0.5rem;">Loading…</div>
          <div v-else-if="operatorRows.length" style="border:1px solid var(--ares-border); border-radius: var(--ares-radius); margin-bottom:0.75rem; overflow:hidden; max-width:520px;">
            <div v-for="op in operatorRows" :key="op.userId" style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.75rem; border-bottom:1px solid var(--ares-border);">
              <i class="pi pi-user" style="color:var(--ares-text-muted); font-size:0.8rem; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:0.83rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ op.displayName || op.email }}</div>
                <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ op.email }} · {{ op.roleName }}</div>
              </div>
              <Button icon="pi pi-times" text size="small" severity="danger" v-tooltip.left="'Remove'" @click="removeOperator(op.userId)" />
            </div>
          </div>
          <p v-else style="font-size:0.8rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">No operators assigned yet.</p>
          <div style="display:flex; gap:0.5rem; align-items:center; max-width:520px;">
            <Select v-model="selectedNewUser" :options="availableUsers" option-label="email" placeholder="Select a user to add…" filter style="flex:1;" size="small">
              <template #option="{ option }">
                <div>
                  <div style="font-size:0.83rem;">{{ option.displayName || option.email }}</div>
                  <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ option.email }}</div>
                </div>
              </template>
            </Select>
            <Button icon="pi pi-plus" label="Add" size="small" :disabled="!selectedNewUser" :loading="addingOperator" @click="addOperator" />
          </div>
        </TabPanel>

        <TabPanel v-if="auth.isAdmin" value="clients">
          <p style="font-size:0.72rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">
            Read-only portal accounts for this organization's own users — projects, published findings and reports only.
          </p>
          <div v-if="operatorsLoading" style="font-size:0.8rem; color:var(--ares-text-muted); margin-bottom:0.5rem;">Loading…</div>
          <div v-else-if="clientUserRows.length" style="border:1px solid var(--ares-border); border-radius: var(--ares-radius); margin-bottom:0.75rem; overflow:hidden; max-width:520px;">
            <div v-for="op in clientUserRows" :key="op.userId" style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.75rem; border-bottom:1px solid var(--ares-border);">
              <i class="pi pi-user" style="color:var(--ares-text-muted); font-size:0.8rem; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:0.83rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ op.displayName || op.email }}</div>
                <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ op.email }}</div>
              </div>
              <Button icon="pi pi-times" text size="small" severity="danger" v-tooltip.left="'Remove'" @click="removeClientUser(op.userId)" />
            </div>
          </div>
          <p v-else style="font-size:0.8rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">No client users assigned yet.</p>
          <div style="display:flex; gap:0.5rem; align-items:center; max-width:520px;">
            <Select v-model="selectedNewClientUser" :options="availableUsers" option-label="email" placeholder="Select a user to add…" filter style="flex:1;" size="small">
              <template #option="{ option }">
                <div>
                  <div style="font-size:0.83rem;">{{ option.displayName || option.email }}</div>
                  <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ option.email }}</div>
                </div>
              </template>
            </Select>
            <Button icon="pi pi-plus" label="Add" size="small" :disabled="!selectedNewClientUser" :loading="addingClientUser" @click="addClientUser" />
          </div>
        </TabPanel>

        <TabPanel v-if="auth.isAdmin" value="contacts">
          <p style="font-size:0.72rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">
            Named email contacts (e.g. a ticketing tool, a client CISO) that any project of this
            organization's "email_recipients" Rules of Engagement can reference to auto-fill To/CC/BCC
            when reporting a finding.
          </p>
          <div v-if="contactsLoading" style="font-size:0.8rem; color:var(--ares-text-muted); margin-bottom:0.5rem;">Loading…</div>
          <div v-else-if="contacts.length" style="border:1px solid var(--ares-border); border-radius: var(--ares-radius); margin-bottom:0.75rem; overflow:hidden; max-width:520px;">
            <div v-for="c in contacts" :key="c.id" style="display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.75rem; border-bottom:1px solid var(--ares-border);">
              <i class="pi pi-at" style="color:var(--ares-text-muted); font-size:0.8rem; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:0.83rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ c.name }}</div>
                <div style="font-size:0.72rem; color:var(--ares-text-muted);">{{ c.email }}</div>
              </div>
              <Button icon="pi pi-times" text size="small" severity="danger" v-tooltip.left="'Remove'" @click="removeContact(c.id)" />
            </div>
          </div>
          <p v-else style="font-size:0.8rem; color:var(--ares-text-muted); margin:0 0 0.75rem;">No contacts yet.</p>
          <div style="display:flex; gap:0.5rem; align-items:center; max-width:520px;">
            <InputText v-model="newContactName" placeholder="Name (e.g. Ticketing)" size="small" style="flex:1;" />
            <InputText v-model="newContactEmail" placeholder="email@example.com" size="small" style="flex:1;" />
            <Button icon="pi pi-plus" label="Add" size="small" :disabled="!newContactName.trim() || !newContactEmail.trim()" :loading="addingContact" @click="addContact" />
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
