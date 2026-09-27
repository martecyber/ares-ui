// Shared metric definitions (labels, per-option choices, and help-tooltip descriptions)
// for the CVSS 4.0/3.1/2.0 calculators. Centralized here because both ScoreDialog.vue
// (single-score add/edit) and ScoreEditorDialog.vue (local-list multi-add) render the
// exact same metric grids and would otherwise duplicate this text verbatim.
//
// SSVC has no equivalent here — its decision points/options/help text are entirely
// data-driven from com.martecyber.ares.ssvc (see SsvcTreeWizard.vue).

import type { Cvss40Metrics, Cvss31Metrics, Cvss20Metrics } from '@/utils/cvss';

export interface MetricOption { label: string; value: string; title: string }
export interface MetricDef<K extends string> { key: K; label: string; description: string; options: MetricOption[] }

export const cvss40Metrics: MetricDef<keyof Cvss40Metrics>[] = [
  { key: 'AV', label: 'Attack Vector', description: 'How the vulnerability is reached by an attacker. Pick the most remote value that still reliably allows exploitation.', options: [
    { label: 'Network',  value: 'N', title: 'Exploitable remotely with no physical access' },
    { label: 'Adjacent', value: 'A', title: 'Adjacent network segment required' },
    { label: 'Local',    value: 'L', title: 'Local access required' },
    { label: 'Physical', value: 'P', title: 'Physical interaction required' },
  ]},
  { key: 'AC', label: 'Attack Complexity', description: 'Conditions beyond the attacker’s control that must hold for exploitation to succeed (e.g. winning a race condition).', options: [
    { label: 'Low',  value: 'L', title: 'No special conditions required' },
    { label: 'High', value: 'H', title: 'Attack depends on conditions beyond attacker control' },
  ]},
  { key: 'AT', label: 'Attack Requirements', description: 'Prerequisite deployment or execution conditions of the target that are not under the attacker’s control (e.g. a non-default configuration).', options: [
    { label: 'None',    value: 'N', title: 'No specific deployment or target conditions required' },
    { label: 'Present', value: 'P', title: 'Target system must be in a specific configuration' },
  ]},
  { key: 'PR', label: 'Privileges Required', description: 'Level of privileges an attacker must already hold on the vulnerable system before exploiting it.', options: [
    { label: 'None', value: 'N', title: 'No prior authentication required' },
    { label: 'Low',  value: 'L', title: 'Basic user capabilities required' },
    { label: 'High', value: 'H', title: 'Significant admin capabilities required' },
  ]},
  { key: 'UI', label: 'User Interaction', description: 'Whether a human other than the attacker must take some action before the vulnerability can be exploited.', options: [
    { label: 'None',    value: 'N', title: 'No interaction from another user is required' },
    { label: 'Passive', value: 'P', title: 'Limited interaction (e.g., visiting a URL)' },
    { label: 'Active',  value: 'A', title: 'Specific interaction required (e.g., typing data)' },
  ]},
  { key: 'VC', label: 'Vuln. Confidentiality', description: 'Impact to confidentiality of the vulnerable component itself once exploited.', options: [
    { label: 'High', value: 'H', title: 'Total loss of confidentiality of vulnerable system' },
    { label: 'Low',  value: 'L', title: 'Some information disclosure of vulnerable system' },
    { label: 'None', value: 'N', title: 'No confidentiality impact on vulnerable system' },
  ]},
  { key: 'VI', label: 'Vuln. Integrity', description: 'Impact to integrity of the vulnerable component itself once exploited.', options: [
    { label: 'High', value: 'H', title: 'Total loss of integrity of vulnerable system' },
    { label: 'Low',  value: 'L', title: 'Modification possible but limited impact' },
    { label: 'None', value: 'N', title: 'No integrity impact on vulnerable system' },
  ]},
  { key: 'VA', label: 'Vuln. Availability', description: 'Impact to availability of the vulnerable component itself once exploited.', options: [
    { label: 'High', value: 'H', title: 'Total loss of availability of vulnerable system' },
    { label: 'Low',  value: 'L', title: 'Reduced performance or interruptions' },
    { label: 'None', value: 'N', title: 'No availability impact on vulnerable system' },
  ]},
  { key: 'SC', label: 'Sub. Confidentiality', description: 'Impact to confidentiality of a system beyond the vulnerable component that becomes reachable through it.', options: [
    { label: 'High', value: 'H', title: 'Total loss of confidentiality of subsequent system' },
    { label: 'Low',  value: 'L', title: 'Some disclosure on subsequent system' },
    { label: 'None', value: 'N', title: 'No confidentiality impact on subsequent system' },
  ]},
  { key: 'SI', label: 'Sub. Integrity', description: 'Impact to integrity of a system beyond the vulnerable component that becomes reachable through it.', options: [
    { label: 'High', value: 'H', title: 'Total loss of integrity of subsequent system' },
    { label: 'Low',  value: 'L', title: 'Modification possible on subsequent system' },
    { label: 'None', value: 'N', title: 'No integrity impact on subsequent system' },
  ]},
  { key: 'SA', label: 'Sub. Availability', description: 'Impact to availability of a system beyond the vulnerable component that becomes reachable through it.', options: [
    { label: 'High', value: 'H', title: 'Total loss of availability of subsequent system' },
    { label: 'Low',  value: 'L', title: 'Reduced performance on subsequent system' },
    { label: 'None', value: 'N', title: 'No availability impact on subsequent system' },
  ]},
];

export const cvss31Metrics: MetricDef<keyof Cvss31Metrics>[] = [
  { key: 'AV', label: 'Attack Vector', description: 'How the vulnerability is reached by an attacker. Pick the most remote value that still reliably allows exploitation.', options: [
    { label: 'Network',  value: 'N', title: 'Exploitable remotely with no physical access required' },
    { label: 'Adjacent', value: 'A', title: 'Requires access to the same network segment' },
    { label: 'Local',    value: 'L', title: 'Requires local access or physical proximity' },
    { label: 'Physical', value: 'P', title: 'Requires physical interaction with the component' },
  ]},
  { key: 'AC', label: 'Attack Complexity', description: 'How much variability exists in conditions beyond the attacker’s control that are needed for a successful attack.', options: [
    { label: 'Low',  value: 'L', title: 'No special conditions required' },
    { label: 'High', value: 'H', title: 'Attack depends on conditions beyond attacker control' },
  ]},
  { key: 'PR', label: 'Privileges Required', description: 'Level of privileges an attacker must already hold on the vulnerable system before exploiting it.', options: [
    { label: 'None', value: 'N', title: 'Attacker requires no prior authentication' },
    { label: 'Low',  value: 'L', title: 'Attacker requires basic user capabilities' },
    { label: 'High', value: 'H', title: 'Attacker requires significant admin capabilities' },
  ]},
  { key: 'UI', label: 'User Interaction', description: 'Whether a legitimate user other than the attacker must participate for the exploit to succeed.', options: [
    { label: 'None',     value: 'N', title: 'No interaction from another user is required' },
    { label: 'Required', value: 'R', title: 'A legitimate user must interact for exploit to succeed' },
  ]},
  { key: 'S', label: 'Scope', description: 'Whether exploiting the vulnerability lets the attacker affect resources beyond the vulnerable component’s own security authority (e.g. escaping a sandbox).', options: [
    { label: 'Unchanged', value: 'U', title: 'Exploited vulnerability only affects resources within same authority' },
    { label: 'Changed',   value: 'C', title: 'Exploited vulnerability can affect resources beyond authorization scope' },
  ]},
  { key: 'C', label: 'Confidentiality', description: 'Impact on confidentiality of the impacted component.', options: [
    { label: 'None', value: 'N', title: 'No impact on confidentiality' },
    { label: 'Low',  value: 'L', title: 'Some limited information disclosure' },
    { label: 'High', value: 'H', title: 'Total loss of confidentiality' },
  ]},
  { key: 'I', label: 'Integrity', description: 'Impact on integrity of the impacted component.', options: [
    { label: 'None', value: 'N', title: 'No impact on integrity' },
    { label: 'Low',  value: 'L', title: 'Modification of data possible but limited impact' },
    { label: 'High', value: 'H', title: 'Total loss of integrity' },
  ]},
  { key: 'A', label: 'Availability', description: 'Impact on availability of the impacted component.', options: [
    { label: 'None', value: 'N', title: 'No impact on availability' },
    { label: 'Low',  value: 'L', title: 'Reduced performance or interruptions' },
    { label: 'High', value: 'H', title: 'Total loss of availability' },
  ]},
];

// ── CVSS 4.0 — Threat & Environmental (optional; Base above is mandatory) ──────────
// Presence of a non-"Not Defined" value here is what drives the CVSS-B/BT/BE/BTE
// classification (see cvss40Classification in utils/cvss.ts).

// ── CVSS 3.1 — Temporal & Environmental (optional; Base above is mandatory) ────────
// Presence of a non-"Not Defined" value in either group is what makes the Temporal/
// Environmental score (respectively) meaningful — see cvss31HasTemporal/
// cvss31HasEnvironmental in utils/cvss.ts.

export const cvss31TemporalMetrics: MetricDef<keyof Cvss31Metrics>[] = [
  { key: 'E', label: 'Exploit Code Maturity', description: 'How likely the vulnerability is to be exploited, based on the maturity of exploit techniques/code known to exist.', options: [
    { label: 'Not Defined',       value: 'X', title: 'Treated as High' },
    { label: 'High',              value: 'H', title: 'Functional autonomous code, or exploitable without code' },
    { label: 'Functional',        value: 'F', title: 'Functional exploit code is available' },
    { label: 'Proof-of-Concept',  value: 'P', title: 'PoC code exists but isn\'t reliably functional' },
    { label: 'Unproven',          value: 'U', title: 'No exploit code is available, or exploit is purely theoretical' },
  ]},
  { key: 'RL', label: 'Remediation Level', description: 'How mature the available remediation is for this vulnerability.', options: [
    { label: 'Not Defined',   value: 'X', title: 'Treated as Unavailable' },
    { label: 'Official Fix',  value: 'O', title: 'A complete vendor solution is available' },
    { label: 'Temporary Fix', value: 'T', title: 'An official but temporary fix is available' },
    { label: 'Workaround',    value: 'W', title: 'An unofficial, non-vendor solution is available' },
    { label: 'Unavailable',   value: 'U', title: 'No solution is available or it is impossible to apply' },
  ]},
  { key: 'RC', label: 'Report Confidence', description: 'How confident the vulnerability report/finding is, in terms of both its existence and technical accuracy.', options: [
    { label: 'Not Defined',    value: 'X', title: 'Treated as Confirmed' },
    { label: 'Confirmed',      value: 'C', title: 'Confirmed with detailed reports or exploitable proof-of-concept' },
    { label: 'Reasonable',     value: 'R', title: 'Significant details published, but not full confidence' },
    { label: 'Unknown',        value: 'U', title: 'Report with little detail or from an unconfirmed source' },
  ]},
];

export const cvss31EnvironmentalMetrics: MetricDef<keyof Cvss31Metrics>[] = [
  { key: 'CR', label: 'Confidentiality Req.', description: 'How important confidentiality of the affected system is to your organization, relative to Integrity/Availability.', options: [
    { label: 'Not Defined', value: 'X', title: 'Treated as Medium' },
    { label: 'High',    value: 'H', title: 'Confidentiality loss would have a catastrophic effect' },
    { label: 'Medium',  value: 'M', title: 'Confidentiality loss would have a serious effect' },
    { label: 'Low',     value: 'L', title: 'Confidentiality loss would have a limited effect' },
  ]},
  { key: 'IR', label: 'Integrity Req.', description: 'How important integrity of the affected system is to your organization, relative to Confidentiality/Availability.', options: [
    { label: 'Not Defined', value: 'X', title: 'Treated as Medium' },
    { label: 'High',    value: 'H', title: 'Integrity loss would have a catastrophic effect' },
    { label: 'Medium',  value: 'M', title: 'Integrity loss would have a serious effect' },
    { label: 'Low',     value: 'L', title: 'Integrity loss would have a limited effect' },
  ]},
  { key: 'AR', label: 'Availability Req.', description: 'How important availability of the affected system is to your organization, relative to Confidentiality/Integrity.', options: [
    { label: 'Not Defined', value: 'X', title: 'Treated as Medium' },
    { label: 'High',    value: 'H', title: 'Availability loss would have a catastrophic effect' },
    { label: 'Medium',  value: 'M', title: 'Availability loss would have a serious effect' },
    { label: 'Low',     value: 'L', title: 'Availability loss would have a limited effect' },
  ]},
  { key: 'MAV', label: 'Modified Attack Vector', description: 'Overrides Attack Vector for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'Network',  value: 'N', title: 'Exploitable remotely with no physical access required' },
    { label: 'Adjacent', value: 'A', title: 'Requires access to the same network segment' },
    { label: 'Local',    value: 'L', title: 'Requires local access or physical proximity' },
    { label: 'Physical', value: 'P', title: 'Requires physical interaction with the component' },
  ]},
  { key: 'MAC', label: 'Modified Attack Complexity', description: 'Overrides Attack Complexity for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'Low',  value: 'L', title: 'No special conditions required' },
    { label: 'High', value: 'H', title: 'Attack depends on conditions beyond attacker control' },
  ]},
  { key: 'MPR', label: 'Modified Privileges Required', description: 'Overrides Privileges Required for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None', value: 'N', title: 'Attacker requires no prior authentication' },
    { label: 'Low',  value: 'L', title: 'Attacker requires basic user capabilities' },
    { label: 'High', value: 'H', title: 'Attacker requires significant admin capabilities' },
  ]},
  { key: 'MUI', label: 'Modified User Interaction', description: 'Overrides User Interaction for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None',     value: 'N', title: 'No interaction from another user is required' },
    { label: 'Required', value: 'R', title: 'A legitimate user must interact for exploit to succeed' },
  ]},
  { key: 'MS', label: 'Modified Scope', description: 'Overrides Scope for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'Unchanged', value: 'U', title: 'Exploited vulnerability only affects resources within same authority' },
    { label: 'Changed',   value: 'C', title: 'Exploited vulnerability can affect resources beyond authorization scope' },
  ]},
  { key: 'MC', label: 'Modified Confidentiality', description: 'Overrides Confidentiality impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None', value: 'N', title: 'No impact on confidentiality' },
    { label: 'Low',  value: 'L', title: 'Some limited information disclosure' },
    { label: 'High', value: 'H', title: 'Total loss of confidentiality' },
  ]},
  { key: 'MI', label: 'Modified Integrity', description: 'Overrides Integrity impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None', value: 'N', title: 'No impact on integrity' },
    { label: 'Low',  value: 'L', title: 'Modification of data possible but limited impact' },
    { label: 'High', value: 'H', title: 'Total loss of integrity' },
  ]},
  { key: 'MA', label: 'Modified Availability', description: 'Overrides Availability impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None', value: 'N', title: 'No impact on availability' },
    { label: 'Low',  value: 'L', title: 'Reduced performance or interruptions' },
    { label: 'High', value: 'H', title: 'Total loss of availability' },
  ]},
];

export const cvss40ThreatMetrics: MetricDef<keyof Cvss40Metrics>[] = [
  { key: 'E', label: 'Exploit Maturity', description: 'How likely the vulnerability is to be exploited in its current state, based on the maturity of exploit code/techniques known to exist.', options: [
    { label: 'Not Defined', value: 'X', title: 'No threat intelligence available — treated as worst-case (Attacked)' },
    { label: 'Attacked',    value: 'A', title: 'Reliable evidence of active exploitation' },
    { label: 'POC',         value: 'P', title: 'Proof-of-concept exploit code exists' },
    { label: 'Unreported',  value: 'U', title: 'No exploit code or activity has been reported' },
  ]},
];

export const cvss40EnvironmentalMetrics: MetricDef<keyof Cvss40Metrics>[] = [
  { key: 'CR', label: 'Confidentiality Req.', description: 'How important confidentiality of the affected system is to your organization, relative to Integrity/Availability.', options: [
    { label: 'Not Defined', value: 'X', title: 'Treated as High' },
    { label: 'High',    value: 'H', title: 'Confidentiality loss would have a catastrophic effect' },
    { label: 'Medium',  value: 'M', title: 'Confidentiality loss would have a serious effect' },
    { label: 'Low',     value: 'L', title: 'Confidentiality loss would have a limited effect' },
  ]},
  { key: 'IR', label: 'Integrity Req.', description: 'How important integrity of the affected system is to your organization, relative to Confidentiality/Availability.', options: [
    { label: 'Not Defined', value: 'X', title: 'Treated as High' },
    { label: 'High',    value: 'H', title: 'Integrity loss would have a catastrophic effect' },
    { label: 'Medium',  value: 'M', title: 'Integrity loss would have a serious effect' },
    { label: 'Low',     value: 'L', title: 'Integrity loss would have a limited effect' },
  ]},
  { key: 'AR', label: 'Availability Req.', description: 'How important availability of the affected system is to your organization, relative to Confidentiality/Integrity.', options: [
    { label: 'Not Defined', value: 'X', title: 'Treated as High' },
    { label: 'High',    value: 'H', title: 'Availability loss would have a catastrophic effect' },
    { label: 'Medium',  value: 'M', title: 'Availability loss would have a serious effect' },
    { label: 'Low',     value: 'L', title: 'Availability loss would have a limited effect' },
  ]},
  { key: 'MAV', label: 'Modified Attack Vector', description: 'Overrides Attack Vector for your specific deployment (e.g. a network service you\'ve firewalled off to local-only access).', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'Network',  value: 'N', title: 'Exploitable remotely with no physical access' },
    { label: 'Adjacent', value: 'A', title: 'Adjacent network segment required' },
    { label: 'Local',    value: 'L', title: 'Local access required' },
    { label: 'Physical', value: 'P', title: 'Physical interaction required' },
  ]},
  { key: 'MAC', label: 'Modified Attack Complexity', description: 'Overrides Attack Complexity for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'Low',  value: 'L', title: 'No special conditions required' },
    { label: 'High', value: 'H', title: 'Attack depends on conditions beyond attacker control' },
  ]},
  { key: 'MAT', label: 'Modified Attack Requirements', description: 'Overrides Attack Requirements for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None',    value: 'N', title: 'No specific deployment or target conditions required' },
    { label: 'Present', value: 'P', title: 'Target system must be in a specific configuration' },
  ]},
  { key: 'MPR', label: 'Modified Privileges Required', description: 'Overrides Privileges Required for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None', value: 'N', title: 'No prior authentication required' },
    { label: 'Low',  value: 'L', title: 'Basic user capabilities required' },
    { label: 'High', value: 'H', title: 'Significant admin capabilities required' },
  ]},
  { key: 'MUI', label: 'Modified User Interaction', description: 'Overrides User Interaction for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'None',    value: 'N', title: 'No interaction from another user is required' },
    { label: 'Passive', value: 'P', title: 'Limited interaction (e.g., visiting a URL)' },
    { label: 'Active',  value: 'A', title: 'Specific interaction required (e.g., typing data)' },
  ]},
  { key: 'MVC', label: 'Modified Vuln. Confidentiality', description: 'Overrides Vulnerable System Confidentiality impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'High', value: 'H', title: 'Total loss of confidentiality of vulnerable system' },
    { label: 'Low',  value: 'L', title: 'Some information disclosure of vulnerable system' },
    { label: 'None', value: 'N', title: 'No confidentiality impact on vulnerable system' },
  ]},
  { key: 'MVI', label: 'Modified Vuln. Integrity', description: 'Overrides Vulnerable System Integrity impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'High', value: 'H', title: 'Total loss of integrity of vulnerable system' },
    { label: 'Low',  value: 'L', title: 'Modification possible but limited impact' },
    { label: 'None', value: 'N', title: 'No integrity impact on vulnerable system' },
  ]},
  { key: 'MVA', label: 'Modified Vuln. Availability', description: 'Overrides Vulnerable System Availability impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'High', value: 'H', title: 'Total loss of availability of vulnerable system' },
    { label: 'Low',  value: 'L', title: 'Reduced performance or interruptions' },
    { label: 'None', value: 'N', title: 'No availability impact on vulnerable system' },
  ]},
  { key: 'MSC', label: 'Modified Sub. Confidentiality', description: 'Overrides Subsequent System Confidentiality impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'High', value: 'H', title: 'Total loss of confidentiality of subsequent system' },
    { label: 'Low',  value: 'L', title: 'Some disclosure on subsequent system' },
    { label: 'None', value: 'N', title: 'No confidentiality impact on subsequent system' },
  ]},
  { key: 'MSI', label: 'Modified Sub. Integrity', description: 'Overrides Subsequent System Integrity impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'High',       value: 'H', title: 'Total loss of integrity of subsequent system' },
    { label: 'Low',        value: 'L', title: 'Modification possible on subsequent system' },
    { label: 'Negligible', value: 'N', title: 'No integrity impact on subsequent system' },
    { label: 'Safety',     value: 'S', title: 'Consequences affect safety' },
  ]},
  { key: 'MSA', label: 'Modified Sub. Availability', description: 'Overrides Subsequent System Availability impact for your specific deployment.', options: [
    { label: 'Not Defined', value: 'X', title: 'Use the Base value' },
    { label: 'High',       value: 'H', title: 'Total loss of availability of subsequent system' },
    { label: 'Low',        value: 'L', title: 'Reduced performance on subsequent system' },
    { label: 'Negligible', value: 'N', title: 'No availability impact on subsequent system' },
    { label: 'Safety',     value: 'S', title: 'Consequences affect safety' },
  ]},
];

// Purely informational per the spec — never affects the score or the CVSS-B/BT/BE/BTE
// classification (see cvss40Classification in utils/cvss.ts).
export const cvss40SupplementalMetrics: MetricDef<keyof Cvss40Metrics>[] = [
  { key: 'S', label: 'Safety', description: 'Whether the vulnerability’s consequences can affect systems relevant to human safety (IEC 61508 sense).', options: [
    { label: 'Not Defined', value: 'X', title: 'Safety impact not evaluated' },
    { label: 'Present',     value: 'P', title: 'Consequences can meet definitions of IEC 61508 categories of "marginal", "critical", or "catastrophic"' },
    { label: 'Negligible',  value: 'N', title: 'Consequences meet definitions of IEC 61508 category "negligible"' },
  ]},
  { key: 'AU', label: 'Automatable', description: 'Whether an attacker can automate exploitation across multiple targets (the "can-and-should-be-automated" sense from the CVSS SIG’s original research).', options: [
    { label: 'Not Defined', value: 'X', title: 'Automatability not evaluated' },
    { label: 'Yes',         value: 'Y', title: 'Steps 1-4 of the attack (reconnaissance, weaponization, delivery, exploitation) can be reliably automated' },
    { label: 'No',          value: 'N', title: 'Attack steps cannot be reliably automated for this vulnerability' },
  ]},
  { key: 'R', label: 'Recovery', description: 'How resilient a system is to recovery after an attack that exploits this vulnerability.', options: [
    { label: 'Not Defined',    value: 'X', title: 'Recovery not evaluated' },
    { label: 'Automatic',      value: 'A', title: 'The system recovers services automatically' },
    { label: 'User',           value: 'U', title: 'The system requires manual intervention to recover services' },
    { label: 'Irrecoverable',  value: 'I', title: 'The system services are irrecoverable by the consumer' },
  ]},
  { key: 'V', label: 'Value Density', description: 'The resources an attacker gains control over with a single exploitation event.', options: [
    { label: 'Not Defined',   value: 'X', title: 'Value density not evaluated' },
    { label: 'Diffuse',       value: 'D', title: 'Limited resources gained (e.g. individual user of a shared service)' },
    { label: 'Concentrated',  value: 'C', title: 'Significant resources gained (e.g. a database of user accounts)' },
  ]},
  { key: 'RE', label: 'Vuln. Response Effort', description: 'The effort required by consumers to respond to this vulnerability (testing, deployment, remediation planning).', options: [
    { label: 'Not Defined', value: 'X', title: 'Response effort not evaluated' },
    { label: 'Low',         value: 'L', title: 'Requires little to no investigation/testing (e.g. simple config change)' },
    { label: 'Moderate',    value: 'M', title: 'Requires some investigation/testing (e.g. a straightforward patch)' },
    { label: 'High',        value: 'H', title: 'Requires significant investigation/testing (e.g. major upgrade or extensive regression testing)' },
  ]},
  { key: 'U', label: 'Provider Urgency', description: 'A supplier-supplied urgency rating, layered on top of the score rather than replacing it.', options: [
    { label: 'Not Defined', value: 'X',     title: 'No urgency rating provided' },
    { label: 'Clear',       value: 'Clear', title: 'Lowest urgency' },
    { label: 'Green',       value: 'Green', title: 'Reduced urgency' },
    { label: 'Amber',       value: 'Amber', title: 'Increased urgency' },
    { label: 'Red',         value: 'Red',   title: 'Highest urgency' },
  ]},
];

export const cvss20Metrics: MetricDef<keyof Cvss20Metrics>[] = [
  { key: 'AV', label: 'Access Vector', description: 'How the vulnerability is reached by an attacker. Pick the most remote value that still reliably allows exploitation.', options: [
    { label: 'Network',  value: 'N', title: 'Exploitable remotely via the network' },
    { label: 'Adjacent', value: 'A', title: 'Access to adjacent network required' },
    { label: 'Local',    value: 'L', title: 'Local access to the system required' },
  ]},
  { key: 'AC', label: 'Access Complexity', description: 'How specialized the conditions must be for exploitation to succeed.', options: [
    { label: 'Low',    value: 'L', title: 'No specialized access conditions exist' },
    { label: 'Medium', value: 'M', title: 'Access conditions are somewhat specialized' },
    { label: 'High',   value: 'H', title: 'Specialized access conditions exist' },
  ]},
  { key: 'Au', label: 'Authentication', description: 'Number of times an attacker must authenticate to the target to exploit it.', options: [
    { label: 'None',     value: 'N', title: 'No authentication required' },
    { label: 'Single',   value: 'S', title: 'Authenticate once to exploit' },
    { label: 'Multiple', value: 'M', title: 'Must authenticate two or more times' },
  ]},
  { key: 'C', label: 'Confidentiality', description: 'Impact on confidentiality of the impacted component.', options: [
    { label: 'None',     value: 'N', title: 'No confidentiality impact' },
    { label: 'Partial',  value: 'P', title: 'Considerable informational disclosure' },
    { label: 'Complete', value: 'C', title: 'Total information disclosure' },
  ]},
  { key: 'I', label: 'Integrity', description: 'Impact on integrity of the impacted component.', options: [
    { label: 'None',     value: 'N', title: 'No integrity impact' },
    { label: 'Partial',  value: 'P', title: 'Modification of some system files possible' },
    { label: 'Complete', value: 'C', title: 'Total compromise of system integrity' },
  ]},
  { key: 'A', label: 'Availability', description: 'Impact on availability of the impacted component.', options: [
    { label: 'None',     value: 'N', title: 'No availability impact' },
    { label: 'Partial',  value: 'P', title: 'Reduced performance or interruptions' },
    { label: 'Complete', value: 'C', title: 'Total shutdown of the affected resource' },
  ]},
];

// ── CVSS 2.0 — Temporal & Environmental (optional; Base above is mandatory) ────────
// Uses 'ND' (Not Defined) rather than 'X' for "unset" — the v2.0 spec's own convention.

export const cvss20TemporalMetrics: MetricDef<keyof Cvss20Metrics>[] = [
  { key: 'E', label: 'Exploitability', description: 'Current state of exploitation techniques or code availability.', options: [
    { label: 'Not Defined',      value: 'ND',  title: 'Treated as High' },
    { label: 'High',             value: 'H',   title: 'Functional autonomous code, or exploitable without code' },
    { label: 'Functional',       value: 'F',   title: 'Functional exploit code is available' },
    { label: 'Proof-of-Concept', value: 'POC', title: 'PoC code exists but isn\'t reliably functional' },
    { label: 'Unproven',         value: 'U',   title: 'No exploit code is available, or exploit is purely theoretical' },
  ]},
  { key: 'RL', label: 'Remediation Level', description: 'How mature the available remediation is for this vulnerability.', options: [
    { label: 'Not Defined',   value: 'ND', title: 'Treated as Unavailable' },
    { label: 'Official Fix',  value: 'OF', title: 'A complete vendor solution is available' },
    { label: 'Temporary Fix', value: 'TF', title: 'An official but temporary fix is available' },
    { label: 'Workaround',    value: 'W',  title: 'An unofficial, non-vendor solution is available' },
    { label: 'Unavailable',   value: 'U',  title: 'No solution is available or it is impossible to apply' },
  ]},
  { key: 'RC', label: 'Report Confidence', description: 'How confident the vulnerability report/finding is.', options: [
    { label: 'Not Defined',   value: 'ND', title: 'Treated as Confirmed' },
    { label: 'Confirmed',     value: 'C',  title: 'Confirmed with detailed reports or exploitable proof-of-concept' },
    { label: 'Uncorroborated', value: 'UR', title: 'Multiple, non-official sources agree' },
    { label: 'Unconfirmed',   value: 'UC', title: 'Single unconfirmed source' },
  ]},
];

export const cvss20EnvironmentalMetrics: MetricDef<keyof Cvss20Metrics>[] = [
  { key: 'CDP', label: 'Collateral Damage Potential', description: 'Potential for loss of physical equipment, property damage, or financial loss from exploitation.', options: [
    { label: 'Not Defined',    value: 'ND', title: 'Treated as None' },
    { label: 'None',           value: 'N',  title: 'No potential for loss' },
    { label: 'Low',            value: 'L',  title: 'Slight physical/financial damage possible' },
    { label: 'Low-Medium',     value: 'LM', title: 'Moderate physical/financial damage possible' },
    { label: 'Medium-High',    value: 'MH', title: 'Significant physical/financial damage possible' },
    { label: 'High',           value: 'H',  title: 'Catastrophic physical/financial damage possible' },
  ]},
  { key: 'TD', label: 'Target Distribution', description: 'Proportion of vulnerable systems within your environment.', options: [
    { label: 'Not Defined', value: 'ND', title: 'Treated as High' },
    { label: 'None',   value: 'N', title: 'No target systems exist' },
    { label: 'Low',    value: 'L', title: '1-25% of systems affected' },
    { label: 'Medium', value: 'M', title: '26-75% of systems affected' },
    { label: 'High',   value: 'H', title: '76-100% of systems affected' },
  ]},
  { key: 'CR', label: 'Confidentiality Req.', description: 'How important confidentiality of the affected system is to your organization.', options: [
    { label: 'Not Defined', value: 'ND', title: 'Treated as Medium' },
    { label: 'High',   value: 'H', title: 'Confidentiality loss would have a catastrophic effect' },
    { label: 'Medium', value: 'M', title: 'Confidentiality loss would have a serious effect' },
    { label: 'Low',    value: 'L', title: 'Confidentiality loss would have a limited effect' },
  ]},
  { key: 'IR', label: 'Integrity Req.', description: 'How important integrity of the affected system is to your organization.', options: [
    { label: 'Not Defined', value: 'ND', title: 'Treated as Medium' },
    { label: 'High',   value: 'H', title: 'Integrity loss would have a catastrophic effect' },
    { label: 'Medium', value: 'M', title: 'Integrity loss would have a serious effect' },
    { label: 'Low',    value: 'L', title: 'Integrity loss would have a limited effect' },
  ]},
  { key: 'AR', label: 'Availability Req.', description: 'How important availability of the affected system is to your organization.', options: [
    { label: 'Not Defined', value: 'ND', title: 'Treated as Medium' },
    { label: 'High',   value: 'H', title: 'Availability loss would have a catastrophic effect' },
    { label: 'Medium', value: 'M', title: 'Availability loss would have a serious effect' },
    { label: 'Low',    value: 'L', title: 'Availability loss would have a limited effect' },
  ]},
];
