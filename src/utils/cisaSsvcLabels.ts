import { ssvcMethodologiesApi, type SsvcTreeNode } from '@/api/ssvcMethodologies';

export interface SsvcOptionLabel {
  label: string;
  helpText: string | null;
}

export interface SsvcDecisionPointLabels {
  name: string;
  help: string | null;
  options: Record<string, SsvcOptionLabel>;
}

export interface CisaSsvcLabels {
  exploitation: SsvcDecisionPointLabels | null;
  automatable: SsvcDecisionPointLabels | null;
  technicalImpact: SsvcDecisionPointLabels | null;
}

function nodeToLabels(node: SsvcTreeNode): SsvcDecisionPointLabels {
  const options: Record<string, SsvcOptionLabel> = {};
  for (const o of node.options ?? []) options[o.code] = { label: o.label, helpText: o.helpText };
  return { name: node.decisionPointName ?? '', help: node.decisionPointHelp, options };
}

let cached: Promise<CisaSsvcLabels> | null = null;

/** Fetches (once, cached for the session) the seeded CISAv1 "cisa" role's Exploitation/
 *  Automatable/Technical Impact decision-point and option labels+help text — reused to
 *  display CISA's raw SSVC assessment on CVE records (see CveEntry.ssvc) with the exact
 *  same vocabulary used when scoring findings/templates, instead of a second, separately
 *  hardcoded lookup table. Every branch at a given depth in this tree shares the same
 *  decision point and option set (it's a full cross-product, not path-dependent), so the
 *  first node reached at each depth is representative of the whole tree. */
export function getCisaSsvcLabels(): Promise<CisaSsvcLabels> {
  if (!cached) {
    cached = (async () => {
      const empty: CisaSsvcLabels = { exploitation: null, automatable: null, technicalImpact: null };
      const methodologies = await ssvcMethodologiesApi.list();
      const methodology = methodologies.find((m) => m.code === 'cisa_v1');
      const role = methodology?.roles.find((r) => r.code === 'cisa');
      if (!role) return empty;
      const detail = await ssvcMethodologiesApi.getRoleDetail(role.id);
      const exploitationNode = detail.tree;
      const automatableNode = exploitationNode?.options?.[0]?.child ?? null;
      const technicalImpactNode = automatableNode?.options?.[0]?.child ?? null;
      return {
        exploitation: exploitationNode ? nodeToLabels(exploitationNode) : null,
        automatable: automatableNode ? nodeToLabels(automatableNode) : null,
        technicalImpact: technicalImpactNode ? nodeToLabels(technicalImpactNode) : null,
      };
    })().catch((e) => {
      cached = null; // allow a retry on the next call instead of caching a permanent failure
      throw e;
    });
  }
  return cached;
}
