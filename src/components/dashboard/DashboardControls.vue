<script setup lang="ts">
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';

/** The instance exposed by a `<DashboardHost ref="...">` template ref (its `defineExpose()`
 *  surface) — shared by every page that hosts a dashboard (platform/org/project) so the
 *  dashboard-switcher + edit-mode controls can render inline in that page's own header, next to
 *  whatever other action buttons it already has, instead of a separate toolbar row. */
defineProps<{ host: Record<string, any> | null }>();
</script>

<template>
  <template v-if="host">
    <!-- Switching dashboards, fullscreening, and creating a new one only make sense outside edit
         mode — while editing, the switcher slot is replaced by the name field below instead. -->
    <template v-if="!host.editMode">
      <Select v-model="host.activeDashboardId" :options="host.dashboards" option-label="name" option-value="id" style="min-width:180px;">
        <template #option="{ option }">
          <span>{{ option.name }}<i v-if="option.isDefault" class="pi pi-star-fill" style="margin-left:0.4rem; font-size:0.7rem; color:var(--ares-accent);" /></span>
        </template>
      </Select>
      <Button icon="pi pi-window-maximize" text size="small" v-tooltip.top="'Fullscreen'" @click="host.toggleFullscreen()" />
    </template>

    <!-- In edit mode the dashboard's name is edited inline here and saved together with the
         widget layout when "Save" is pressed — no separate rename dialog/action anymore. -->
    <InputText v-else v-model="host.editingName" style="min-width:180px; max-width:260px;" placeholder="Dashboard name" />

    <template v-if="host.canEdit">
      <Button v-if="!host.editMode" icon="pi pi-plus" text size="small" v-tooltip.top="'New dashboard'" @click="host.openCreateDialog()" />
      <Button v-if="host.dashboard && !host.dashboard.isDefault" icon="pi pi-star" text size="small" v-tooltip.top="'Set as default'" @click="host.setActiveAsDefault()" />
      <Button v-if="host.dashboards.length > 1" icon="pi pi-trash" text size="small" severity="danger" v-tooltip.top="'Delete dashboard'" @click="host.deleteActive()" />

      <template v-if="host.editMode">
        <Button icon="pi pi-plus" text size="small" severity="secondary" v-tooltip.top="'Add widget'" @click="host.showAddDialog = true" />
        <Button v-if="host.canSaveTemplate" icon="pi pi-clone" text size="small" severity="secondary" v-tooltip.top="'Save as template'" @click="host.openSaveAsTemplateDialog()" />
        <Button
          v-if="host.canTogglePresentable"
          :icon="host.editingPresentable ? 'pi pi-eye' : 'pi pi-eye-slash'"
          text size="small" :severity="host.editingPresentable ? 'success' : 'secondary'"
          v-tooltip.top="host.editingPresentable ? 'Presentable — can be added to a dashboard presentation' : 'Not presentable — click to allow this dashboard in presentations'"
          @click="host.editingPresentable = !host.editingPresentable"
        />
        <Button icon="pi pi-check" text size="small" :loading="host.saving" v-tooltip.top="'Save'" @click="host.saveLayout()" />
        <Button icon="pi pi-times" text size="small" severity="danger" v-tooltip.top="'Cancel'" @click="host.toggleEditMode()" />
      </template>
      <Button v-else icon="pi pi-pencil" text size="small" severity="secondary" v-tooltip.top="'Edit dashboard'" @click="host.toggleEditMode()" />
    </template>
  </template>
</template>
