import { confirmDialog } from './useConfirmDialog';

/**
 * Wraps a "save as template" API call that supports an `overwrite` flag and rejects with
 * 409 + `code: 'duplicate_name'` on a name collision — see finding-templates.ts's fromFinding,
 * workflow-templates.ts's create/fromWorkflow, agent-task-templates.ts's create/fromTask.
 *
 * On a collision, asks the operator whether to overwrite the existing template. Declining
 * re-throws the original error so the caller's own "save as template" dialog stays open — the
 * operator edits the name field that's already right there and saves again, no separate "rename"
 * UI needed. This is what lets repeatedly saving edits under the same name update one template in
 * place instead of silently piling up near-duplicates.
 *
 * `attempt` is called once with overwrite=false, and — only if the operator confirms — a second
 * time with overwrite=true.
 */
export async function saveAsTemplate<T>(
  attempt: (overwrite: boolean) => Promise<T>,
  templateName: string,
  kind: string,
): Promise<T> {
  try {
    return await attempt(false);
  } catch (e: any) {
    if (e?.response?.status === 409 && e?.response?.data?.code === 'duplicate_name') {
      const overwrite = await confirmDialog({
        header: 'Template already exists',
        message: `A ${kind} named "${templateName}" already exists. Overwrite it with this content, or cancel and choose a different name.`,
        acceptLabel: 'Overwrite',
        rejectLabel: 'Cancel',
        acceptSeverity: 'warn',
        acceptIcon: 'pi pi-refresh',
      });
      if (overwrite) {
        return await attempt(true);
      }
    }
    throw e;
  }
}
