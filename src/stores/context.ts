import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface OrgContext {
  id: number;
  name: string;
  slug: string;
  hasLogo: boolean;
}

export interface ProjectContext {
  id: number;
  name: string;
  code: string | null;
  typeCode: string | null;
  supertypeCode?: string | null;
  /** Whether CLIENT_USER/CLIENT_ADMIN accounts may view this project's Detections. */
  clientsCanViewDetections?: boolean;
}

export const useContextStore = defineStore('context', () => {
  const org = ref<OrgContext | null>(null);
  const project = ref<ProjectContext | null>(null);

  function setOrg(o: OrgContext) {
    org.value = o;
    project.value = null;
  }

  // Restores org context from route params without clearing project (used for URL/refresh sync)
  function restoreOrg(o: OrgContext) {
    org.value = o;
  }

  function setProject(e: ProjectContext) {
    project.value = e;
  }

  function clearProject() {
    project.value = null;
  }

  function clear() {
    org.value = null;
    project.value = null;
  }

  return { org, project, setOrg, restoreOrg, setProject, clearProject, clear };
});
