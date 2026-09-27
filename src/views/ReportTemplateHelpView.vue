<script setup lang="ts">
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import AresBadge from '@/components/AresBadge.vue';

const router = useRouter();
</script>

<template>
  <div>
    <div class="ares-page-header">
      <div>
        <h2 class="ares-page-title"><i class="pi pi-book" style="margin-right:0.4rem;" />Template Authoring Guide</h2>
        <p class="ares-page-subtitle">
          Complete reference for every variable available in Word (.docx) templates.
          The variables follow exactly the structure of the JSON exportable from each report.
        </p>
      </div>
      <Button icon="pi pi-arrow-left" text severity="secondary" v-tooltip.top="'Back to templates'" @click="router.push({ name: 'report-templates' })" />
    </div>

    <div style="display:flex; flex-direction:column; gap:1.5rem; max-width:960px;">

      <!-- ── Basic syntax ──────────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">Basic syntax</h3>
        <p class="help-body">
          The template engine is <strong>poi-tl</strong>. Four tag types:
        </p>
        <table class="ares-table" style="margin-top:0.75rem;">
          <thead><tr><th>Syntax</th><th>Use</th><th>Example</th></tr></thead>
          <tbody>
            <tr>
              <td><code class="var-code">&#123;&#123;variable&#125;&#125;</code></td>
              <td>Simple variable (plain text)</td>
              <td class="eg"><code>&#123;&#123;organization.name&#125;&#125;</code></td>
            </tr>
            <tr>
              <td><code class="var-code">&#123;&#123;@variable&#125;&#125;</code></td>
              <td>Document block — for fields with images (<code>_doc</code>)</td>
              <td class="eg"><code>&#123;&#123;@fields.description_doc&#125;&#125;</code></td>
            </tr>
            <tr>
              <td><code class="var-code">&#123;&#123;?array&#125;&#125; … &#123;&#123;/array&#125;&#125;</code></td>
              <td>Iteration in free text (separate paragraphs)</td>
              <td class="eg"><code>&#123;&#123;?team&#125;&#125;…&#123;&#123;/team&#125;&#125;</code></td>
            </tr>
            <tr>
              <td><code class="var-code">&#123;&#123;array&#125;&#125; … [[field]]</code></td>
              <td>Iteration in a table (LoopRowTableRenderPolicy) — <code>&#123;&#123;array&#125;&#125;</code> in the trigger row, <code>[[field]]</code> in the template row</td>
              <td class="eg">see the "Tables" section</td>
            </tr>
          </tbody>
        </table>
        <div class="help-note" style="margin-top:0.75rem;">
          <i class="pi pi-info-circle" style="margin-right:0.4rem;" />
          <strong>Split placeholder:</strong> if Word splits <code>&#123;&#123;…&#125;&#125;</code> across several XML runs (e.g. by formatting part of the text), poi-tl won't detect it.
          Ares automatically repairs split placeholders before rendering, but if the problem persists: type the whole placeholder first and apply formatting afterwards.
        </div>
      </section>

      <!-- ── Tables ────────────────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">Iterating in tables — LoopRowTableRenderPolicy</h3>
        <p class="help-body">
          To repeat rows in a Word table, use <strong>LoopRow</strong> mode:
          put <code class="var-code">&#123;&#123;findings&#125;&#125;</code> (or the array's name) alone in a "trigger" row —
          that row is removed after rendering. The next row is the template; use
          <code class="var-code">[[field]]</code> (double brackets) for the variables inside it.
          That row is duplicated once for every item in the array.
        </p>
        <div class="help-example-block" style="font-size:0.82rem; line-height:2;">
          <div><strong>Header row:</strong> &nbsp;Code &nbsp;|&nbsp; Title &nbsp;|&nbsp; Severity</div>
          <div><strong>Trigger row:</strong> &nbsp;<code class="var-code">&#123;&#123;findings&#125;&#125;</code></div>
          <div><strong>Template row:</strong> &nbsp;<code class="var-code">[[code]]</code> &nbsp;|&nbsp; <code class="var-code">[[title]]</code> &nbsp;|&nbsp; <code class="var-code">[[severity]]</code></div>
        </div>
        <p class="help-body" style="margin-top:0.75rem;">
          Arrays supporting LoopRow (any of them can be used as a table trigger):
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.3rem;">
          <template v-for="a in ['findings','team','projectScope','projectScopeIn','projectScopeOut','scores','references','affections','affects','detectedAt','affectedAssets','detections','detectionsByIteration']" :key="a">
            <code class="var-code" style="background:var(--ares-surface); border:1px solid var(--ares-border); border-radius: var(--ares-radius); padding:0.15rem 0.4rem;">&#123;&#123;{{a}}&#125;&#125;</code>
          </template>
        </div>
      </section>

      <!-- ── Root variables ──────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">Root variables (outside any loop)</h3>

        <!-- organization -->
        <h4 class="help-group-title">organization</h4>
        <table class="ares-table" style="margin-bottom:1.25rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">&#123;&#123;organization.id&#125;&#125;</code></td><td>Organization ID</td><td class="eg">1</td></tr>
            <tr><td><code class="var-code">&#123;&#123;organization.name&#125;&#125;</code></td><td>Organization name</td><td class="eg">Acme Corp</td></tr>
            <tr><td><code class="var-code">&#123;&#123;organization.slug&#125;&#125;</code></td><td>Organization slug</td><td class="eg">acme</td></tr>
          </tbody>
        </table>

        <!-- report -->
        <h4 class="help-group-title">report</h4>
        <table class="ares-table" style="margin-bottom:1.25rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">&#123;&#123;report.id&#125;&#125;</code></td><td>Report ID</td><td class="eg">42</td></tr>
            <tr><td><code class="var-code">&#123;&#123;report.title&#125;&#125;</code></td><td>Report title</td><td class="eg">Pentest Q2 2026</td></tr>
            <tr><td><code class="var-code">&#123;&#123;report.status&#125;&#125;</code></td><td>Report status</td><td class="eg">draft</td></tr>
            <tr><td><code class="var-code">&#123;&#123;report.createdAt&#125;&#125;</code></td><td>Creation date (ISO 8601)</td><td class="eg">2026-05-18T06:05:19Z</td></tr>
            <tr><td><code class="var-code">&#123;&#123;report.created_at&#125;&#125;</code></td><td>Alias of createdAt</td><td class="eg">2026-05-18T06:05:19Z</td></tr>
            <tr>
              <td><code class="var-code">&#123;&#123;report.date&#125;&#125;</code></td>
              <td>Formatted generation date <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td>
              <td class="eg">18/05/2026</td>
            </tr>
          </tbody>
        </table>

        <!-- project -->
        <h4 class="help-group-title">project</h4>
        <table class="ares-table" style="margin-bottom:1.25rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">&#123;&#123;project.id&#125;&#125;</code></td><td>Project ID</td><td class="eg">4</td></tr>
            <tr><td><code class="var-code">&#123;&#123;project.name&#125;&#125;</code></td><td>Project name</td><td class="eg">Pentest Acme</td></tr>
            <tr><td><code class="var-code">&#123;&#123;project.code&#125;&#125;</code></td><td>Project code</td><td class="eg">ACME-ASSESS-26-03</td></tr>
            <tr><td><code class="var-code">&#123;&#123;project.startDate&#125;&#125;</code></td><td>Start date</td><td class="eg">2026-05-11</td></tr>
            <tr><td><code class="var-code">&#123;&#123;project.start_date&#125;&#125;</code></td><td>Alias of startDate</td><td class="eg">2026-05-11</td></tr>
            <tr><td><code class="var-code">&#123;&#123;project.endDate&#125;&#125;</code></td><td>End date</td><td class="eg">2026-05-25</td></tr>
            <tr><td><code class="var-code">&#123;&#123;project.end_date&#125;&#125;</code></td><td>Alias of endDate</td><td class="eg">2026-05-25</td></tr>
          </tbody>
        </table>

        <!-- scope -->
        <h4 class="help-group-title">Project scope</h4>
        <p class="help-body">
          Scope can be iterated in three ways: the full list, IN-SCOPE entries only, or OUT-OF-SCOPE entries only.
          Each has a pre-rendered variant (<code>_list</code>) for use inside table cells, plus boolean guard flags.
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable / Array</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">&#123;&#123;projectScope&#125;&#125;</code></td><td>Full array of scope entries (LoopRow trigger)</td></tr>
            <tr><td><code class="var-code">&#123;&#123;projectScopeIn&#125;&#125;</code></td><td>IN-SCOPE entries only (LoopRow trigger)</td></tr>
            <tr><td><code class="var-code">&#123;&#123;projectScopeOut&#125;&#125;</code></td><td>OUT-OF-SCOPE entries only (LoopRow trigger)</td></tr>
            <tr><td><code class="var-code">&#123;&#123;project_scope_list&#125;&#125;</code></td><td>Pre-rendered bullet list (whole scope) — usable in cells</td></tr>
            <tr><td><code class="var-code">&#123;&#123;projectScopeEmpty&#125;&#125;</code> / <code class="var-code">&#123;&#123;projectScopeNotEmpty&#125;&#125;</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td></tr>
            <tr><td><code class="var-code">&#123;&#123;projectScopeInEmpty&#125;&#125;</code> / <code class="var-code">&#123;&#123;projectScopeInNotEmpty&#125;&#125;</code></td><td>IN-SCOPE guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td></tr>
            <tr><td><code class="var-code">&#123;&#123;projectScopeOutEmpty&#125;&#125;</code> / <code class="var-code">&#123;&#123;projectScopeOutNotEmpty&#125;&#125;</code></td><td>OUT-OF-SCOPE guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td></tr>
          </tbody>
        </table>
        <p class="help-body">Variables inside each scope row (<code>[[kind]]</code>, etc. in LoopRow mode):</p>
        <table class="ares-table" style="margin-bottom:1.25rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">kind</code></td><td>Scope entry type</td><td class="eg">host</td></tr>
            <tr><td><code class="var-code">value</code></td><td>Value (IP, domain, URL…)</td><td class="eg">192.168.1.0/24</td></tr>
            <tr><td><code class="var-code">inScope</code></td><td><code>IN</code> or <code>OUT</code></td><td class="eg">IN</td></tr>
            <tr><td><code class="var-code">notes</code></td><td>Optional notes</td><td class="eg">—</td></tr>
          </tbody>
        </table>

        <!-- fields (report-level) -->
        <h4 class="help-group-title">fields <span style="font-weight:400; font-size:0.8rem;">— custom report fields</span></h4>
        <p class="help-body">
          Report fields (executive summary, etc.) are accessed as <code>fields.&lt;slug&gt;</code>,
          where the slug is the internal name defined in <em>Admin → Report Field Types</em>.
          Use the <code>_doc</code> variant with the <code>&#123;&#123;@&#125;&#125;</code> syntax for properly
          formatted output — headings, bold/italic, lists, quotes, code blocks and images, following the
          uploaded template's own Word styles (Heading 1/2, Quote, etc. when it defines them).
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Use</th></tr></thead>
          <tbody>
            <tr>
              <td><code class="var-code">&#123;&#123;fields.&lt;slug&gt;&#125;&#125;</code></td>
              <td>Flattened plain text of the field, structure discarded — simple and predictable inside a table cell</td>
            </tr>
            <tr>
              <td><code class="var-code">&#123;&#123;@fields.&lt;slug&gt;_doc&#125;&#125;</code></td>
              <td>
                Structured content: Markdown headings/bold/italic/lists/quotes/code blocks rendered as real Word
                formatting, plus any images at their original position. Absent only when the field is empty.
              </td>
            </tr>
          </tbody>
        </table>
        <div class="help-note">
          <i class="pi pi-info-circle" style="margin-right:0.4rem;" />
          <strong>Rule of thumb:</strong> prefer <code>&#123;&#123;@fields.slug_doc&#125;&#125;</code> everywhere — it's the one
          that actually reflects what the author wrote (headings, lists, bold, images and all).
          <code>&#123;&#123;fields.slug&#125;&#125;</code> is only for spots where formatting can't be used, like a plain table cell.
          Don't use both tags for the same field — <code>_doc</code> already includes the text.
        </div>

        <!-- counts -->
        <h4 class="help-group-title" style="margin-top:1.25rem;">
          Counts by severity <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" />
        </h4>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">&#123;&#123;findingsCount&#125;&#125;</code></td><td>Total findings in the report</td></tr>
            <tr><td><code class="var-code">&#123;&#123;findingsCountCritical&#125;&#125;</code></td><td>Findings with CRITICAL severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;findingsCountHigh&#125;&#125;</code></td><td>Findings with HIGH severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;findingsCountMedium&#125;&#125;</code></td><td>Findings with MEDIUM severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;findingsCountLow&#125;&#125;</code></td><td>Findings with LOW severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;findingsCountInfo&#125;&#125;</code></td><td>Findings with INFO severity</td></tr>
          </tbody>
        </table>

        <!-- charts -->
        <h4 class="help-group-title">
          Severity charts <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" />
        </h4>
        <p class="help-body">
          Two charts generated automatically as PNG images: a doughnut and a bar chart,
          using the same colors and icons as the platform. They're inserted directly into the document with
          <code>&#123;&#123;@&#125;&#125;</code> (block syntax). Put them in their own paragraph in the Word template.
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th></tr></thead>
          <tbody>
            <tr>
              <td><code class="var-code">&#123;&#123;@chartPie&#125;&#125;</code></td>
              <td>Doughnut chart by severity — 300×210 pt</td>
            </tr>
            <tr>
              <td><code class="var-code">&#123;&#123;@chartBar&#125;&#125;</code></td>
              <td>Bar chart by severity — 300×210 pt</td>
            </tr>
          </tbody>
        </table>
        <div class="help-note">
          <i class="pi pi-info-circle" style="margin-right:0.4rem;" />
          These variables are independent of <em>report fields</em> — they can be used anywhere in the template without creating a field.
          If you'd rather embed the chart inside a text field's content, type <code>&#123;&#123;chart:pie&#125;&#125;</code> or <code>&#123;&#123;chart:bar&#125;&#125;</code> in the field's content editor and access the result with <code>&#123;&#123;@fields.&lt;slug&gt;_doc&#125;&#125;</code>.
        </div>
      </section>

      <!-- ── Team ─────────────────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">team — Project team</h3>
        <p class="help-body">
          Iterate with <code class="var-code">&#123;&#123;?team&#125;&#125; … &#123;&#123;/team&#125;&#125;</code> in free text,
          or with the <code class="var-code">&#123;&#123;team&#125;&#125;</code> trigger in LoopRow mode for tables.
          For use inside cells without iterating: <code class="var-code">&#123;&#123;team_list&#125;&#125;</code>.
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">userId</code></td><td>User ID</td><td class="eg">1</td></tr>
            <tr><td><code class="var-code">role</code></td><td>Role on the project</td><td class="eg">lead</td></tr>
            <tr><td><code class="var-code">displayName</code></td><td>Member's name</td><td class="eg">Martín Romera</td></tr>
            <tr><td><code class="var-code">email</code></td><td>Member's email</td><td class="eg">mromera@example.com</td></tr>
            <tr><td><code class="var-code">addedAt</code></td><td>Date added to the project (ISO)</td><td class="eg">2026-05-03T08:58:55Z</td></tr>
          </tbody>
        </table>
        <table class="ares-table">
          <thead><tr><th>Placeholder</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">&#123;&#123;team_list&#125;&#125;</code></td><td>Pre-rendered bullet list: <em>Name (role): email</em> — usable in cells</td></tr>
            <tr><td><code class="var-code">&#123;&#123;teamEmpty&#125;&#125;</code> / <code class="var-code">&#123;&#123;teamNotEmpty&#125;&#125;</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td></tr>
          </tbody>
        </table>
      </section>

      <!-- ── Findings ──────────────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">findings</h3>
        <p class="help-body">
          The report's main array. Use <code class="var-code">&#123;&#123;findings&#125;&#125;</code> as a LoopRow trigger in tables,
          or <code class="var-code">&#123;&#123;?findings&#125;&#125; … &#123;&#123;/findings&#125;&#125;</code> in free text.
        </p>

        <h4 class="help-group-title">Finding fields</h4>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">code</code></td><td>Finding code</td><td class="eg">ACME-ASSESS-26-03-1</td></tr>
            <tr><td><code class="var-code">title</code></td><td>Title</td><td class="eg">SQL Injection in login</td></tr>
            <tr>
              <td><code class="var-code">severity</code></td>
              <td>Priority text (P0-P4 by default, or the template's custom text) <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td>
              <td class="eg">P0</td>
            </tr>
            <tr>
              <td><code class="var-code">status</code></td>
              <td>Numeric ID of the finding's status</td>
              <td class="eg">1</td>
            </tr>
            <tr>
              <td><code class="var-code">affectedAssetsCount</code></td>
              <td>Number of unique affected assets (deduplicated) <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td>
              <td class="eg">3</td>
            </tr>
            <tr>
              <td><code class="var-code">affectionsCount</code></td>
              <td>Number of occurrences (affections) of the finding <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td>
              <td class="eg">2</td>
            </tr>
          </tbody>
        </table>

        <h4 class="help-group-title">fields — custom finding fields</h4>
        <p class="help-body">
          The finding's text fields (description, impact, remediation…) are accessed as <code>fields.&lt;slug&gt;</code>.
          The slug is the internal name defined in <em>Admin → Finding Field Types</em>.
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Use</th></tr></thead>
          <tbody>
            <tr>
              <td><code class="var-code">fields.&lt;slug&gt;</code></td>
              <td>Flattened plain text (always available, no formatting)</td>
            </tr>
            <tr>
              <td><code class="var-code">&#123;&#123;@fields.&lt;slug&gt;_doc&#125;&#125;</code></td>
              <td>Structured content (headings/lists/bold/quotes/code/images, following the template's Word styles) — requires <code>@</code> syntax</td>
            </tr>
          </tbody>
        </table>

        <h4 class="help-group-title">defaultScore</h4>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">defaultScore.type</code></td><td>Metric type</td><td class="eg">CVSS 3.1</td></tr>
            <tr><td><code class="var-code">defaultScore.score</code></td><td>Score</td><td class="eg">9.8</td></tr>
            <tr><td><code class="var-code">defaultScore.vector</code></td><td>CVSS vector</td><td class="eg">CVSS:3.1/AV:N/AC:L/…</td></tr>
          </tbody>
        </table>

        <h4 class="help-group-title">scores — every score on the finding</h4>
        <p class="help-body">LoopRow trigger: <code class="var-code">&#123;&#123;scores&#125;&#125;</code></p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">type</code></td><td>Metric type (CVSS 3.1, CVSS 4.0…)</td></tr>
            <tr><td><code class="var-code">score</code></td><td>Numeric score</td></tr>
            <tr><td><code class="var-code">isDefault</code></td><td>Boolean — whether this is the score marked as default</td></tr>
            <tr><td><code class="var-code">vector</code></td><td>Vector</td></tr>
            <tr><td><code class="var-code">scoresEmpty</code> / <code class="var-code">scoresNotEmpty</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td></tr>
          </tbody>
        </table>

        <h4 class="help-group-title">references — the finding's references</h4>
        <p class="help-body">
          LoopRow trigger: <code class="var-code">&#123;&#123;references&#125;&#125;</code> (full list) or
          <code class="var-code">&#123;&#123;references&lt;Catalog&gt;&#125;&#125;</code> (filtered by catalog —
          first letter uppercase, rest lowercase).
        </p>
        <table class="ares-table" style="margin-bottom:0.5rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">catalog</code></td><td>Catalog code</td><td class="eg">CWE</td></tr>
            <tr><td><code class="var-code">title</code></td><td>Identifier</td><td class="eg">CWE-89</td></tr>
            <tr><td><code class="var-code">description</code></td><td>Reference description</td><td class="eg">SQL Injection</td></tr>
          </tbody>
        </table>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Catalog</th><th>LoopRow / loop trigger</th><th>Pre-rendered list</th><th>Empty flag</th></tr></thead>
          <tbody>
            <tr><td>All</td><td><code class="var-code">&#123;&#123;references&#125;&#125;</code></td><td>—</td><td><code class="var-code">referencesEmpty / referencesNotEmpty</code></td></tr>
            <tr><td>CWE</td><td><code class="var-code">&#123;&#123;referencesCwe&#125;&#125;</code></td><td><code class="var-code">&#123;&#123;referencesCwe_list&#125;&#125;</code></td><td><code class="var-code">referencesCweEmpty</code></td></tr>
            <tr><td>CAPEC</td><td><code class="var-code">&#123;&#123;referencesCapec&#125;&#125;</code></td><td><code class="var-code">&#123;&#123;referencesCapec_list&#125;&#125;</code></td><td><code class="var-code">referencesCapecEmpty</code></td></tr>
            <tr><td>OWASP</td><td><code class="var-code">&#123;&#123;referencesOwasp&#125;&#125;</code></td><td><code class="var-code">&#123;&#123;referencesOwasp_list&#125;&#125;</code></td><td><code class="var-code">referencesOwaspEmpty</code></td></tr>
            <tr><td>ATT&amp;CK</td><td><code class="var-code">&#123;&#123;referencesAttack&#125;&#125;</code></td><td><code class="var-code">&#123;&#123;referencesAttack_list&#125;&#125;</code></td><td><code class="var-code">referencesAttackEmpty</code></td></tr>
            <tr><td><em>Any other</em></td><td><code class="var-code">&#123;&#123;references&lt;FirstUppercase&gt;&#125;&#125;</code></td><td><code class="var-code">&#123;&#123;references&lt;…&gt;_list&#125;&#125;</code></td><td><code class="var-code">references&lt;…&gt;Empty</code></td></tr>
          </tbody>
        </table>
        <div class="help-note">
          The <code>_list</code> variants generate a pre-rendered bullet list formatted as <em>title — description</em>, usable inside table cells.
          If the finding has no references for the given catalog, the list is empty and nothing renders.
        </div>
      </section>

      <!-- ── Affections ──────────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">affections — Occurrences of the finding</h3>
        <p class="help-body">
          LoopRow trigger: <code class="var-code">&#123;&#123;affections&#125;&#125;</code>. Each occurrence describes where and how the finding was observed.
        </p>

        <h4 class="help-group-title">Fields of each affection</h4>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">code</code></td><td>Occurrence code</td><td class="eg">ACME-ASSESS-26-03-1-1</td></tr>
            <tr><td><code class="var-code">title</code></td><td>Occurrence title</td><td class="eg">Occurrence 1</td></tr>
            <tr><td><code class="var-code">description</code></td><td>Description (plain text)</td><td class="eg">—</td></tr>
            <tr><td><code class="var-code">&#123;&#123;@description_doc&#125;&#125;</code></td><td>Description with images (only if it has images)</td><td class="eg">—</td></tr>
            <tr><td><code class="var-code">status</code></td><td>Occurrence status</td><td class="eg">open</td></tr>
            <tr>
              <td><code class="var-code">affectedCount</code></td>
              <td>Number of assets affected in this occurrence <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td>
              <td class="eg">2</td>
            </tr>
            <tr>
              <td><code class="var-code">stillAffectedCount</code></td>
              <td>Number of assets not yet resolved <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td>
              <td class="eg">1</td>
            </tr>
            <tr><td><code class="var-code">affectionsEmpty</code> / <code class="var-code">affectionsNotEmpty</code></td><td>Guard booleans for the parent array <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td><td class="eg">—</td></tr>
          </tbody>
        </table>

        <h4 class="help-group-title">affects — assets affected in this occurrence</h4>
        <p class="help-body">
          LoopRow trigger: <code class="var-code">&#123;&#123;affects&#125;&#125;</code> (inside the affections block).
          Also available: <code class="var-code">&#123;&#123;affects_list&#125;&#125;</code> (pre-rendered bullet list for use in cells,
          formatted as <em>[type] identifier (status)</em>).
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">id</code></td><td>Asset ID</td><td class="eg">350</td></tr>
            <tr><td><code class="var-code">code</code></td><td>Asset code</td><td class="eg">TEST2-HOST-13</td></tr>
            <tr><td><code class="var-code">type</code></td><td>Asset type</td><td class="eg">host</td></tr>
            <tr><td><code class="var-code">identifier</code></td><td>Identifier</td><td class="eg">192.168.68.20</td></tr>
            <tr><td><code class="var-code">status</code></td><td>Asset status in this occurrence</td><td class="eg">resolved</td></tr>
            <tr><td><code class="var-code">affectsEmpty</code> / <code class="var-code">affectsNotEmpty</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td><td class="eg">—</td></tr>
          </tbody>
        </table>

        <h4 class="help-group-title">detectedAt — assets where the occurrence was detected</h4>
        <p class="help-body">
          LoopRow trigger: <code class="var-code">&#123;&#123;detectedAt&#125;&#125;</code> (inside the affections block).
          Also available: <code class="var-code">&#123;&#123;detectedAt_list&#125;&#125;</code> (pre-rendered bullet list,
          formatted as <em>[type] identifier</em>).
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">id</code></td><td>Asset ID</td><td class="eg">350</td></tr>
            <tr><td><code class="var-code">code</code></td><td>Asset code</td><td class="eg">TEST2-HOST-13</td></tr>
            <tr><td><code class="var-code">type</code></td><td>Asset type</td><td class="eg">host</td></tr>
            <tr><td><code class="var-code">identifier</code></td><td>Identifier</td><td class="eg">192.168.68.20</td></tr>
            <tr><td><code class="var-code">observedAt</code></td><td>First detected date (ISO)</td><td class="eg">2026-05-09T23:05:02Z</td></tr>
            <tr><td><code class="var-code">detectedAtEmpty</code> / <code class="var-code">detectedAtNotEmpty</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td><td class="eg">—</td></tr>
          </tbody>
        </table>

        <h4 class="help-group-title">affectedAssets — unique assets affected by the finding (finding level)</h4>
        <p class="help-body">
          Deduplicated list of every asset affected in any occurrence of the finding.
          LoopRow trigger: <code class="var-code">&#123;&#123;affectedAssets&#125;&#125;</code>.
          Variables: <code>id</code>, <code>code</code>, <code>type</code>, <code>identifier</code> (no <code>status</code> or <code>observedAt</code>).
        </p>
        <table class="ares-table">
          <thead><tr><th>Variable</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">affectedAssetsEmpty</code> / <code class="var-code">affectedAssetsNotEmpty</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td></tr>
          </tbody>
        </table>
      </section>

      <!-- ── Detections ───────────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">detections</h3>
        <p class="help-body">
          Detections aren't part of any report by default — this array is simply <strong>available</strong> for
          templates that want to include it. Use <code class="var-code">&#123;&#123;detections&#125;&#125;</code> as a LoopRow
          trigger in tables, or <code class="var-code">&#123;&#123;?detections&#125;&#125; … &#123;&#123;/detections&#125;&#125;</code> in free
          text — including inside a custom report field's content (Executive Summary, etc.), the same way
          <code class="var-code">&#123;&#123;?findings&#125;&#125;</code> works there.
        </p>
        <div class="help-note">
          <i class="pi pi-info-circle" style="margin-right:0.4rem;" />
          <strong>Scope:</strong> when the report's findings carry an iteration label (MONITOR projects generated
          for a specific iteration range), <code>detections</code> is narrowed to that same range. Otherwise it's
          every detection in the project.
        </div>

        <h4 class="help-group-title" style="margin-top:1rem;">Detection fields</h4>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">id</code></td><td>Detection ID</td><td class="eg">1204</td></tr>
            <tr><td><code class="var-code">title</code></td><td>Title</td><td class="eg">Outdated jQuery version</td></tr>
            <tr><td><code class="var-code">severity</code></td><td>Severity (uppercase)</td><td class="eg">HIGH</td></tr>
            <tr><td><code class="var-code">status</code></td><td>Status code</td><td class="eg">affected</td></tr>
            <tr><td><code class="var-code">sourceType</code></td><td>Tool/integration that reported it</td><td class="eg">nuclei</td></tr>
            <tr><td><code class="var-code">occurrenceCount</code></td><td>Times re-seen across imports</td><td class="eg">4</td></tr>
            <tr><td><code class="var-code">firstSeen</code></td><td>First recorded date (ISO)</td><td class="eg">2026-06-02T09:12:04Z</td></tr>
            <tr><td><code class="var-code">lastSeen</code></td><td>Most recent sighting (ISO)</td><td class="eg">2026-07-14T11:40:00Z</td></tr>
            <tr><td><code class="var-code">asset.type</code> / <code class="var-code">asset.identifier</code></td><td>Asset the detection is on</td><td class="eg">host / 192.168.1.10</td></tr>
            <tr><td><code class="var-code">detectionsEmpty</code> / <code class="var-code">detectionsNotEmpty</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td><td class="eg">—</td></tr>
          </tbody>
        </table>

        <h4 class="help-group-title">Counts by severity <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></h4>
        <table class="ares-table">
          <thead><tr><th>Variable</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">&#123;&#123;detectionsCount&#125;&#125;</code></td><td>Total detections in scope</td></tr>
            <tr><td><code class="var-code">&#123;&#123;detectionsCountCritical&#125;&#125;</code></td><td>Detections with CRITICAL severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;detectionsCountHigh&#125;&#125;</code></td><td>Detections with HIGH severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;detectionsCountMedium&#125;&#125;</code></td><td>Detections with MEDIUM severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;detectionsCountLow&#125;&#125;</code></td><td>Detections with LOW severity</td></tr>
            <tr><td><code class="var-code">&#123;&#123;detectionsCountInfo&#125;&#125;</code></td><td>Detections with INFO severity</td></tr>
          </tbody>
        </table>
      </section>

      <!-- ── Detections by iteration ──────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">detectionsByIteration <span style="font-weight:400; font-size:0.8rem;">— MONITOR projects</span></h3>
        <p class="help-body">
          One row per iteration this project has recorded detection activity for — how many detections
          entered each area (opened / escalated / closed) during that period. LoopRow trigger:
          <code class="var-code">&#123;&#123;detectionsByIteration&#125;&#125;</code>. A detection can count in more than one
          column if it changed to more than one of these states within the same iteration.
        </p>
        <table class="ares-table" style="margin-bottom:0.75rem;">
          <thead><tr><th>Variable</th><th>Description</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">label</code></td><td>Iteration label</td><td class="eg">2026-W24</td></tr>
            <tr><td><code class="var-code">opened</code></td><td>New or reopened detections</td><td class="eg">6</td></tr>
            <tr><td><code class="var-code">escalated</code></td><td>Detections escalated to a finding</td><td class="eg">2</td></tr>
            <tr><td><code class="var-code">closed</code></td><td>Detections fixed / ignored / not-affected / out-of-scope</td><td class="eg">5</td></tr>
          </tbody>
        </table>
        <table class="ares-table">
          <thead><tr><th>Variable</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code class="var-code">detectionsByIterationEmpty</code> / <code class="var-code">detectionsByIterationNotEmpty</code></td><td>Guard booleans <AresBadge value="computed" severity="secondary" style="font-size:0.6rem;" /></td></tr>
          </tbody>
        </table>
      </section>

      <!-- ── Priority colors ──────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">Priority colors</h3>
        <p class="help-body">
          Ares can automatically replace a "magic" placeholder color in the document with the
          real color for each priority, including text, underline, character shading and cell background.
          Configure the magic color and the per-priority colors in the template's edit dialog — there
          you can also customize the text shown for each level (P0-P4 by default).
        </p>
        <div class="help-note">
          <i class="pi pi-info-circle" style="margin-right:0.4rem;" />
          The engine detects the finding's priority by scanning the text of each paragraph and table row.
          For it to work correctly, the cell or paragraph containing the priority text
          (by default <em>P0</em>, <em>P1</em>… or the custom text you've configured) must be
          present in the rendered template — i.e. the finding's <code>severity</code> variable
          (see below) unmodified. Detection is case-insensitive and tolerates extra text
          (e.g. "Priority: P1").
        </div>
      </section>

      <!-- ── Tips ─────────────────────────────────────────────────── -->
      <section class="help-card">
        <h3 class="help-section-title">Tips and common mistakes</h3>
        <ul style="margin:0; padding-left:1.25rem; display:flex; flex-direction:column; gap:0.55rem; font-size:0.87rem; line-height:1.6;">
          <li>
            <strong>Download the report's JSON</strong> before designing the template to see the real values it will be generated with.
          </li>
          <li>
            <strong>LoopRow in a table:</strong> the trigger row contains only <code>&#123;&#123;findings&#125;&#125;</code> (or another array);
            the next row is the template with <code>[[field]]</code>. The trigger row disappears from the final document.
          </li>
          <li>
            <strong>Loop in free text:</strong> <code>&#123;&#123;?findings&#125;&#125;</code> and <code>&#123;&#123;/findings&#125;&#125;</code>
            can be in separate paragraphs; poi-tl repeats everything between them.
          </li>
          <li>
            <strong>Images in fields (<code>_doc</code>):</strong> use <code>&#123;&#123;@fields.slug_doc&#125;&#125;</code> in its own paragraph.
            The <code>&#123;&#123;@&#125;&#125;</code> tag inserts the whole content (text + images) at once.
            <code>&#123;&#123;fields.slug&#125;&#125;</code> (without <code>@</code> or <code>_doc</code>) always gives plain text — no images.
            Don't use both tags for the same field; <code>_doc</code> already includes the text.
          </li>
          <li>
            <strong>Severity charts:</strong> use <code>&#123;&#123;@chartPie&#125;&#125;</code> or <code>&#123;&#123;@chartBar&#125;&#125;</code>
            in their own paragraph. They're pre-generated images — you don't need any report field.
            You can also put <code>&#123;&#123;chart:pie&#125;&#125;</code> / <code>&#123;&#123;chart:bar&#125;&#125;</code> inside a text field's content
            and then use <code>&#123;&#123;@fields.slug_doc&#125;&#125;</code> in the template.
          </li>
          <li>
            <strong>severity is the configured priority text</strong> (by default <code>P0</code>, <code>P1</code>… — or the level's
            custom text if you've configured one in "Priority colors") — use it as-is or apply formatting in Word.
          </li>
          <li>
            <strong>The finding's status is a numeric ID,</strong> not a readable string.
            To show the status name, use a custom finding field or hardcode it in the template.
          </li>
          <li>
            <strong>Guard flags (<code>*Empty</code> / <code>*NotEmpty</code>):</strong> poi-tl treats <code>false</code> booleans
            as a conditional block with <code>&#123;&#123;?teamEmpty&#125;&#125;</code>. Use them to show alternative text when an array is empty.
          </li>
          <li>
            <strong>Computed variables</strong> <AresBadge value="computed" severity="secondary" style="font-size:0.65rem;" /> — are additions on top of the JSON:
            <code>report.date</code>, <code>findingsCount*</code>, <code>detectionsCount*</code>, <code>affectedAssetsCount</code>, <code>affectionsCount</code>,
            <code>affectedCount</code>, <code>stillAffectedCount</code>, <code>*Empty</code>/<code>*NotEmpty</code>.
          </li>
          <li>
            <strong>There's no global references_list:</strong> only the per-catalog variants exist
            (<code>referencesCwe_list</code>, <code>referencesCapec_list</code>, etc.).
          </li>
        </ul>
      </section>

    </div>
  </div>
</template>

<style scoped>
.help-card {
  background: var(--ares-surface-raised);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 1.25rem 1.5rem;
}

.help-section-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 0.6rem;
  color: var(--ares-text);
}

.help-group-title {
  font-size: 0.875rem;
  font-weight: 700;
  margin: 1rem 0 0.4rem;
  color: var(--ares-accent);
  border-bottom: 1px solid var(--ares-border);
  padding-bottom: 0.2rem;
}

.help-body {
  font-size: 0.875rem;
  line-height: 1.65;
  color: var(--ares-text);
  margin: 0 0 0.5rem;
}

.var-code {
  color: var(--ares-accent);
  font-weight: 600;
  font-size: 0.82rem;
}

.eg {
  color: var(--ares-text-muted);
  font-size: 0.8rem;
}

.help-example-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--ares-text-muted);
  margin-bottom: 0.3rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.help-example-block {
  background: var(--ares-surface);
  border: 1px solid var(--ares-border);
  border-radius: var(--ares-radius);
  padding: 0.6rem 0.85rem;
}

.help-note {
  background: var(--ares-surface);
  border-left: 3px solid var(--ares-accent);
  border-radius: 0 var(--ares-radius) var(--ares-radius) 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  color: var(--ares-text-muted);
  line-height: 1.55;
  margin-top: 0.5rem;
}
</style>
