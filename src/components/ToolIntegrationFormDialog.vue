<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Password from 'primevue/password';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import { useToast } from 'primevue/usetoast';
import { toolIntegrationsApi, INTEGRATION_TYPES, type ToolIntegration } from '@/api/tool-integrations';
import IntegrationGrantsPanel from '@/components/IntegrationGrantsPanel.vue';

const props = defineProps<{
  visible: boolean;
  integration: ToolIntegration | null;
  preselectedType?: string;
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  'saved': [];
}>();

const toast = useToast();

const name        = ref('');
const type        = ref('tenable');
const accessKey   = ref('');
const secretKey   = ref('');
const apiKey      = ref('');
const baseUrl     = ref('');
const gmpHost     = ref('');
const gmpPort     = ref(9390);
const gmpUsername = ref('');
const gmpPassword = ref('');
const gmpUseTls   = ref(true);
const gmpInsecureTls = ref(false);
const gmpWebUrl   = ref('');
const vdpApiUsername = ref(''); // Bugcrowd only
const vdpApiToken    = ref(''); // Bugcrowd + YesWeHack
const qualysUsername = ref('');
const qualysPassword = ref('');
const qualysPlatform = ref('US1');
const qualysInventoryModule = ref('gav');
const action1ClientId     = ref('');
const action1ClientSecret = ref('');
const action1Region       = ref('NorthAmerica');
const action1OrgId        = ref('');
const crowdstrikeClientId     = ref('');
const crowdstrikeClientSecret = ref('');
const crowdstrikeRegion       = ref('us-1');
const fortireconApiKey = ref('');
const fortireconOrgId  = ref('');

const ACTION1_REGIONS = [
  { label: 'North America (default)', value: 'NorthAmerica' },
  { label: 'NA-2', value: 'NA-2' },
  { label: 'Europe', value: 'Europe' },
  { label: 'Australia', value: 'Australia' },
];
const CROWDSTRIKE_REGIONS = [
  { label: 'US-1 (default)', value: 'us-1' },
  { label: 'US-2', value: 'us-2' },
  { label: 'EU-1', value: 'eu-1' },
  { label: 'US-GOV-1', value: 'us-gov-1' },
];

// Region codes must match QualysClient's PLATFORMS table (ares-core) — kept as a small constant
// here rather than fetched from the backend since it changes rarely and this avoids a round trip
// just to populate a dropdown.
const QUALYS_PLATFORMS = [
  { label: 'US1 (default)', value: 'US1' },
  { label: 'US2', value: 'US2' },
  { label: 'US3', value: 'US3' },
  { label: 'US4', value: 'US4' },
  { label: 'EU1', value: 'EU1' },
  { label: 'EU2', value: 'EU2' },
  { label: 'EU3', value: 'EU3' },
  { label: 'UK1', value: 'UK1' },
  { label: 'AE1', value: 'AE1' },
  { label: 'KSA1', value: 'KSA1' },
  { label: 'IN1', value: 'IN1' },
  { label: 'CA1', value: 'CA1' },
  { label: 'AU1', value: 'AU1' },
];
const QUALYS_INVENTORY_MODULES = [
  { label: 'Global AssetView (GAV)', value: 'gav' },
  { label: 'CyberSecurity Asset Management (CSAM)', value: 'csam' },
];

// Some gvmd deployments are found running GMP in plain text (no TLS at all) — "ignore
// certificate errors" is meaningless without TLS, so force it off and disable the toggle.
watch(gmpUseTls, (useTls) => {
  if (!useTls) gmpInsecureTls.value = false;
});
const saving      = ref(false);
const testResult  = ref<'success' | 'failed' | null>(null);
const activeTab   = ref('general');

// Bugcrowd authenticates with a username+token pair (account email + API token);
// YesWeHack with a bare personal access token.
const needsVdpUsername = computed(() => type.value === 'bugcrowd');
const vdpPlatformHint = computed(() => {
  switch (type.value) {
    case 'bugcrowd':  return 'Generate a token at Bugcrowd → profile menu → API Credentials. Both your account email and the token are required. Requires a Program Owner (customer) account, not a researcher one.';
    case 'yeswehack': return 'Generate a personal access token at YesWeHack → Account → API tokens.';
    default: return '';
  }
});

const isEdit = computed(() => !!props.integration);
const title  = computed(() => {
  if (isEdit.value) return 'Edit integration';
  const label = INTEGRATION_TYPES.find((t) => t.id === type.value)?.label ?? type.value;
  return `New ${label} integration`;
});

watch(() => props.visible, (open) => {
  if (!open) return;
  activeTab.value = 'general';
  const i = props.integration;
  name.value      = i?.name ?? '';
  // Edit mode must always use the integration's own real type — preselectedType is a
  // page-lifetime ref from the create-flow's type picker and is never null, so a plain
  // `preselectedType ?? i?.type` would silently override the real type here.
  type.value      = isEdit.value ? (i?.type ?? 'tenable') : (props.preselectedType ?? 'tenable');
  accessKey.value = '';
  secretKey.value = '';
  apiKey.value    = '';
  gmpUsername.value = '';
  gmpPassword.value = '';
  vdpApiUsername.value = '';
  vdpApiToken.value = '';
  qualysUsername.value = '';
  qualysPassword.value = '';
  action1ClientId.value = '';
  action1ClientSecret.value = '';
  crowdstrikeClientId.value = '';
  crowdstrikeClientSecret.value = '';
  fortireconApiKey.value = '';
  try {
    const s = i?.settings ? JSON.parse(i.settings) : {};
    baseUrl.value = s.baseUrl ?? '';
    gmpHost.value = s.host ?? '';
    gmpPort.value = s.port ?? 9390;
    gmpUseTls.value = s.tls ?? true;
    gmpInsecureTls.value = !!s.insecureTls;
    gmpWebUrl.value = s.webUrl ?? '';
    qualysPlatform.value = s.platform ?? 'US1';
    qualysInventoryModule.value = s.inventoryModule ?? 'gav';
    action1Region.value = s.region ?? 'NorthAmerica';
    action1OrgId.value = s.orgId ?? '';
    crowdstrikeRegion.value = s.region ?? 'us-1';
    fortireconOrgId.value = s.orgId ?? '';
  } catch {
    baseUrl.value = ''; gmpHost.value = ''; gmpPort.value = 9390;
    gmpUseTls.value = true; gmpInsecureTls.value = false; gmpWebUrl.value = '';
    qualysPlatform.value = 'US1'; qualysInventoryModule.value = 'gav';
    action1Region.value = 'NorthAmerica'; action1OrgId.value = '';
    crowdstrikeRegion.value = 'us-1';
    fortireconOrgId.value = '';
  }
  testResult.value = null;
});

async function testAndSave() {
  if (!name.value.trim()) return;
  saving.value = true;
  try {
    let settings: string | undefined;
    if (type.value === 'greenbone') {
      settings = JSON.stringify({
        host: gmpHost.value.trim(),
        port: gmpPort.value || 9390,
        tls: gmpUseTls.value,
        insecureTls: gmpUseTls.value && gmpInsecureTls.value,
        webUrl: gmpWebUrl.value.trim() || undefined,
      });
    } else if (type.value === 'qualys') {
      settings = JSON.stringify({
        platform: qualysPlatform.value,
        inventoryModule: qualysInventoryModule.value,
      });
    } else if (type.value === 'action1') {
      settings = JSON.stringify({
        region: action1Region.value,
        orgId: action1OrgId.value.trim(),
      });
    } else if (type.value === 'crowdstrike') {
      settings = JSON.stringify({ region: crowdstrikeRegion.value });
    } else if (type.value === 'fortirecon') {
      settings = JSON.stringify({ orgId: fortireconOrgId.value.trim() });
    } else if (baseUrl.value.trim()) {
      settings = JSON.stringify({ baseUrl: baseUrl.value.trim() });
    }
    const credentials: Record<string, string> = {};
    if (accessKey.value) credentials.accessKey = accessKey.value;
    if (secretKey.value) credentials.secretKey = secretKey.value;
    if (apiKey.value)    credentials.apiKey    = apiKey.value;
    if (gmpUsername.value) credentials.username = gmpUsername.value;
    if (gmpPassword.value) credentials.password = gmpPassword.value;
    if (type.value === 'bugcrowd' || type.value === 'yeswehack') {
      if (vdpApiToken.value)    credentials.api_token    = vdpApiToken.value;
      if (vdpApiUsername.value) credentials.api_username = vdpApiUsername.value;
    }
    if (type.value === 'qualys') {
      if (qualysUsername.value) credentials.username = qualysUsername.value;
      if (qualysPassword.value) credentials.password = qualysPassword.value;
    }
    if (type.value === 'action1') {
      if (action1ClientId.value)     credentials.client_id     = action1ClientId.value;
      if (action1ClientSecret.value) credentials.client_secret = action1ClientSecret.value;
    }
    if (type.value === 'crowdstrike') {
      if (crowdstrikeClientId.value)     credentials.client_id     = crowdstrikeClientId.value;
      if (crowdstrikeClientSecret.value) credentials.client_secret = crowdstrikeClientSecret.value;
    }
    if (type.value === 'fortirecon') {
      if (fortireconApiKey.value) credentials.apiKey = fortireconApiKey.value;
    }

    if (isEdit.value) {
      await toolIntegrationsApi.update(props.integration!.id, {
        name: name.value.trim(),
        settings,
        credentials: Object.keys(credentials).length ? credentials : undefined,
      });
    } else {
      await toolIntegrationsApi.create({
        name: name.value.trim(),
        type: type.value,
        scope: 'PLATFORM',
        settings,
        credentials,
      });
    }
    toast.add({ severity: 'success', summary: isEdit.value ? 'Integration updated' : 'Integration created', life: 3000 });
    emit('saved');
    emit('update:visible', false);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.response?.data?.message ?? e.message, life: 5000 });
  } finally { saving.value = false; }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="title"
    modal
    :style="{ width: 'min(560px, 96vw)' }"
    :pt="{ content: { style: 'padding: 1.25rem' } }"
    @update:visible="$emit('update:visible', $event)"
  >
    <Tabs v-if="isEdit" v-model:value="activeTab">
      <TabList>
        <Tab value="general">General</Tab>
        <Tab value="grants">Grants</Tab>
      </TabList>
    </Tabs>
    <div v-show="!isEdit || activeTab === 'general'" :style="isEdit ? 'padding-top:1.25rem;' : ''">
    <form @submit.prevent="testAndSave" style="display:flex; flex-direction:column; gap:1rem;">

      <!-- Name -->
      <div>
        <label class="dlg-label">Name *</label>
        <InputText v-model="name" style="width:100%;" placeholder="e.g. Tenable MSSP" required />
      </div>

      <!-- Tenable-specific fields -->
      <template v-if="type === 'tenable' || type === 'tenable-mssp'">
        <div>
          <label class="dlg-label">Access Key *</label>
          <Password v-model="accessKey" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Tenable access key'" />
        </div>
        <div>
          <label class="dlg-label">Secret Key *</label>
          <Password v-model="secretKey" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Tenable secret key'" />
        </div>
        <div>
          <label class="dlg-label">
            Platform URL
            <span style="font-weight:400; color:var(--ares-text-muted);">(default: cloud.tenable.com)</span>
          </label>
          <InputText v-model="baseUrl" style="width:100%;" placeholder="https://cloud.tenable.com" />
        </div>
      </template>

      <!-- Qualys-specific fields — no MSSP/child-account concept (unlike Tenable): every tenant
           is a fully separate subscription with its own region + credentials. VMDR (vulns) and
           GAV/CSAM (assets) share the same username/password login. -->
      <template v-if="type === 'qualys'">
        <div>
          <label class="dlg-label">Username *</label>
          <InputText v-model="qualysUsername" style="width:100%;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Qualys username'" />
        </div>
        <div>
          <label class="dlg-label">Password *</label>
          <Password v-model="qualysPassword" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Qualys password'" />
        </div>
        <div>
          <label class="dlg-label">Platform / region *</label>
          <Select v-model="qualysPlatform" :options="QUALYS_PLATFORMS" optionLabel="label" optionValue="value"
            style="width:100%;" />
        </div>
        <div>
          <label class="dlg-label">
            Asset inventory module *
            <span style="font-weight:400; color:var(--ares-text-muted);">(the tenant usually has only one active)</span>
          </label>
          <Select v-model="qualysInventoryModule" :options="QUALYS_INVENTORY_MODULES" optionLabel="label" optionValue="value"
            style="width:100%;" />
        </div>
      </template>

      <!-- Action1-specific fields — RMM/patch platform, endpoint inventory + CVE data only
           (patch deployment itself is out of scope for this integration). One API credential can
           see several Action1 orgs; orgId picks which one to sync. -->
      <template v-if="type === 'action1'">
        <div>
          <label class="dlg-label">Client ID *</label>
          <InputText v-model="action1ClientId" style="width:100%;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'e.g. you@action1.com'" />
        </div>
        <div>
          <label class="dlg-label">Client Secret *</label>
          <Password v-model="action1ClientSecret" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Action1 client secret'" />
        </div>
        <div>
          <label class="dlg-label">Region *</label>
          <Select v-model="action1Region" :options="ACTION1_REGIONS" optionLabel="label" optionValue="value"
            style="width:100%;" />
        </div>
        <div>
          <label class="dlg-label">
            Organization ID *
            <span style="font-weight:400; color:var(--ares-text-muted);">(from Action1 → Organizations)</span>
          </label>
          <InputText v-model="action1OrgId" style="width:100%;" placeholder="Action1 organization id" />
        </div>
      </template>

      <!-- CrowdStrike-specific fields — Falcon API OAuth2 client-credentials, region-selected
           base URL (a Falcon API client is minted for one specific cloud already). -->
      <template v-if="type === 'crowdstrike'">
        <div>
          <label class="dlg-label">Client ID *</label>
          <Password v-model="crowdstrikeClientId" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Falcon API client ID'" />
        </div>
        <div>
          <label class="dlg-label">Client Secret *</label>
          <Password v-model="crowdstrikeClientSecret" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Falcon API client secret'" />
        </div>
        <div>
          <label class="dlg-label">Cloud region *</label>
          <Select v-model="crowdstrikeRegion" :options="CROWDSTRIKE_REGIONS" optionLabel="label" optionValue="value"
            style="width:100%;" />
        </div>
      </template>

      <!-- FortiRecon-specific fields (EASM module only). NOTE: auth header convention and full
           field schema are unverified against a live tenant — see FortiReconClient's class
           javadoc (ares-core). API key generated in FortiRecon → Profile Settings. -->
      <template v-if="type === 'fortirecon'">
        <div>
          <label class="dlg-label">API Key *</label>
          <Password v-model="fortireconApiKey" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'FortiRecon API key'" />
        </div>
        <div>
          <label class="dlg-label">
            Organization ID *
            <span style="font-weight:400; color:var(--ares-text-muted);">(FortiRecon → Profile Settings)</span>
          </label>
          <InputText v-model="fortireconOrgId" style="width:100%;" placeholder="FortiRecon organization id" />
        </div>
      </template>

      <!-- Shodan-specific fields -->
      <template v-if="type === 'shodan'">
        <div>
          <label class="dlg-label">API Key *</label>
          <Password v-model="apiKey" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'Shodan API key'" />
        </div>
      </template>

      <!-- Greenbone/OpenVAS-specific fields — GMP is a raw TLS socket protocol, not REST -->
      <template v-if="type === 'greenbone'">
        <div style="display:flex; gap:0.75rem;">
          <div style="flex:1; min-width:0;">
            <label class="dlg-label">Host *</label>
            <InputText v-model="gmpHost" style="width:100%;" placeholder="gvm.example.com" />
          </div>
          <div style="flex:0 0 100px;">
            <label class="dlg-label">Port</label>
            <InputNumber v-model="gmpPort" fluid :use-grouping="false" placeholder="9390" />
          </div>
        </div>
        <div>
          <label class="dlg-label">Username *</label>
          <InputText v-model="gmpUsername" style="width:100%;"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'GMP username'" />
        </div>
        <div>
          <label class="dlg-label">Password *</label>
          <Password v-model="gmpPassword" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'GMP password'" />
        </div>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <ToggleSwitch v-model="gmpUseTls" input-id="gmp-use-tls" />
          <label for="gmp-use-tls" style="font-size:0.85rem; color:var(--ares-text-muted);">
            Use TLS
          </label>
        </div>
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <ToggleSwitch v-model="gmpInsecureTls" input-id="gmp-insecure-tls" :disabled="!gmpUseTls" />
          <label for="gmp-insecure-tls" style="font-size:0.85rem; color:var(--ares-text-muted);" :style="{ opacity: gmpUseTls ? 1 : 0.5 }">
            Ignore TLS certificate errors (self-signed certificates)
          </label>
        </div>
        <div>
          <label class="dlg-label">
            Web UI URL
            <span style="font-weight:400; color:var(--ares-text-muted);">(optional — links detections to their NVT page)</span>
          </label>
          <InputText v-model="gmpWebUrl" style="width:100%;" placeholder="https://gvm.example.com" />
        </div>
      </template>

      <!-- Bugcrowd/YesWeHack-specific fields -->
      <template v-if="type === 'bugcrowd' || type === 'yeswehack'">
        <div v-if="needsVdpUsername">
          <label class="dlg-label">API Username *</label>
          <InputText v-model="vdpApiUsername" style="width:100%;"
            :placeholder="isEdit ? '(unchanged)' : 'your@email.com'" />
        </div>
        <div>
          <label class="dlg-label">API Token *</label>
          <Password v-model="vdpApiToken" style="width:100%;" :feedback="false"
            :placeholder="isEdit ? '(unchanged — enter to update)' : 'API token'" />
        </div>
        <p v-if="vdpPlatformHint" style="font-size:0.77rem; color:var(--ares-text-muted); margin:0;">
          {{ vdpPlatformHint }}
        </p>
      </template>

      <div style="display:flex; justify-content:flex-end; gap:0.5rem; padding-top:0.25rem;">
        <Button type="button" label="Cancel" severity="secondary" size="small" @click="$emit('update:visible', false)" />
        <Button type="submit" :label="isEdit ? 'Save' : 'Create'" icon="pi pi-check" size="small" :loading="saving" />
      </div>
    </form>
    </div>
    <div v-if="isEdit && activeTab === 'grants'" style="padding-top:1.25rem;">
      <IntegrationGrantsPanel v-if="integration" :integration="integration" />
    </div>
  </Dialog>
</template>

<style scoped>
.dlg-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.35rem;
}
</style>
