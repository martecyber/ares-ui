import { ssvcMethodologiesApi, type SsvcTreeNode } from '@/api/ssvcMethodologies';
import type { KnownOutcome } from '@/components/ssvc/SsvcRoleSettingsDialog.vue';

/** Walks every leaf of a decision tree and collects its distinct outcome codes into the
 *  reusable palette SsvcTreeDiagramTable's leaf dropdowns pick from. Single source of
 *  truth for this derivation — reused by SsvcTreeNodeEditor (its own live tree state) and
 *  KbSsvcMethodologyDetailView (deriving straight from a freshly-fetched role, to avoid
 *  reading a sibling component's reactive state before it's had a render tick to update). */
export function deriveKnownOutcomes(tree: SsvcTreeNode | null): KnownOutcome[] {
  const known = new Map<string, KnownOutcome>();
  const walk = (n: SsvcTreeNode | null) => {
    if (!n) return;
    if (n.nodeType === 'leaf') {
      if (n.outcomeCode && !known.has(n.outcomeCode)) {
        known.set(n.outcomeCode, {
          code: n.outcomeCode,
          label: n.outcomeLabel ?? '',
          description: n.outcomeDescription ?? '',
          priorityLevel: n.priorityLevel,
        });
      }
      return;
    }
    for (const opt of n.options ?? []) walk(opt.child);
  };
  walk(tree);
  return [...known.values()];
}

// A leaf node's methodology/role never change once scored (only deleted/restructured,
// which would break the score entirely), so it's safe to cache resolutions for the session.
const methodologyNameCache = new Map<number, { methodologyName: string; roleName: string }>();

/** Resolves each given SSVC leaf node id to its methodology's display name plus its role
 *  name (e.g. "CISAv1"/"CISA"), so a score's bare "SSVC" type label can be annotated with
 *  which methodology AND role produced it (e.g. "SSVC - CISAv1 (CISA)"). Best-effort: a leaf
 *  node that no longer exists (its role's tree was restructured since this score was taken)
 *  is silently omitted rather than failing the whole batch — callers just fall back to the
 *  plain "SSVC" label for that score. */
export async function resolveSsvcMethodologyNames(leafNodeIds: (number | null | undefined)[]): Promise<Map<number, { methodologyName: string; roleName: string }>> {
  const unique = [...new Set(leafNodeIds.filter((id): id is number => id != null))];
  const uncached = unique.filter((id) => !methodologyNameCache.has(id));
  if (uncached.length) {
    const methodologies = await ssvcMethodologiesApi.list();
    const nameByMethodologyId = new Map(methodologies.map((m) => [m.id, m.name]));
    await Promise.all(uncached.map(async (leafNodeId) => {
      try {
        const roleId = await ssvcMethodologiesApi.getRoleIdForNode(leafNodeId);
        const role = await ssvcMethodologiesApi.getRoleDetail(roleId);
        const methodologyName = nameByMethodologyId.get(role.methodologyId);
        if (methodologyName) methodologyNameCache.set(leafNodeId, { methodologyName, roleName: role.name });
      } catch {
        // Leaf node no longer exists — leave unresolved, caller falls back to "SSVC".
      }
    }));
  }
  const result = new Map<number, { methodologyName: string; roleName: string }>();
  for (const id of unique) {
    const entry = methodologyNameCache.get(id);
    if (entry) result.set(id, entry);
  }
  return result;
}
