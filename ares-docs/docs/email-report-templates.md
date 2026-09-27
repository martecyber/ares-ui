---
sidebar_position: 2
---

# Email report templates

An **email report template** (Knowledge Base → Templates → Reports → Email) is the email
counterpart to a DOCX report template: instead of generating a Word document, it renders a
finding straight into an email's subject and HTML body. You pick one the same way you pick a DOCX
template when delivering a report — as an action on a workflow's "Report finding" node, or
manually from a report.

A template is restricted to **one finding per email** — the variable model below is flat
(`finding.*`), not a list. A report grouping several findings still needs the DOCX path.

## `{{var}}` placeholders

Both the **subject** and the **HTML body** are plain templates: anything wrapped in double curly
braces is substituted with the finding's data when the report is sent. Everything else is passed
through unchanged.

```
[{{finding.severityLabel}}] {{finding.code}} — {{finding.title}}
```

Values are HTML-escaped in the body (so a finding title containing `<` or `&` renders safely) and
left as plain text in the subject.

### Available variables

| Variable | Description |
|---|---|
| `finding.id` | Numeric finding ID |
| `finding.code` | The finding's short code (e.g. `F-001`) |
| `finding.title` | Finding title |
| `finding.priority` | `P0`–`P4`, same scale AQL uses to filter findings |
| `finding.status` | The finding's current status name |
| `finding.dueDate` | Due date, if set |
| `finding.severityLabel` | Display label for the severity badge — see [Severity colors](#severity-colors) below |
| `finding.severityColor` | Hex color (`#rrggbb`) for the severity badge — see [Severity colors](#severity-colors) below |
| `finding.fields.<slug>` | One variable per custom finding field (`finding.fields.description`, `finding.fields.impact`, `finding.fields.remediation`, …) — rendered down to plain text |
| `project.name` | The finding's project name |
| `project.code` | The finding's project code |
| `organization.name` | The finding's organization name |
| `report.title` | Only set when sent through the manual "Deliver report" flow (not when sent directly from a workflow) |

The field names deliberately mirror AQL's own finding field names (`code`, `priority`, `status`,
`fields.<slug>`) — if you already know how to filter findings in AQL, you already know most of
these names.

## Repeat blocks — `{{#name}}...{{/name}}`

A finding's affections and references are lists, not single values, so a plain `{{var}}` can't
render them — there could be zero, one, or many. Instead, wrap the part of your template that
should repeat in a **block**:

```
{{#finding.affections}}
  <p>{{code}} - {{title}}</p>
{{/finding.affections}}
```

The fragment between the opening and closing tags is repeated once per item in the list, with
that item's own fields (`{{code}}`, `{{title}}`, …) resolved inside it — variables from outside
the block (like `{{finding.severityColor}}`) still work inside it too. If the list is missing or
empty, the whole block — tags and fragment — disappears; no empty section, no stray whitespace.
Blocks can **nest** (an affection's own affected-assets list, below, is itself a nested block).

You control the HTML entirely — there's no fixed "affections" or "references" layout baked into
the app. Put the fields in whatever markup, order, or styling you want.

### `finding.affections`

One item per affection linked to the finding:

| Field | Description |
|---|---|
| `code` | Affection code |
| `title` | Affection title |
| `description` | Affection description |
| `status` | Affection status |
| `affects` | Nested list of assets this affection affects (see below) |
| `detectedAt` | Nested list of assets this affection was detected on (see below) |

Each item in `affects`/`detectedAt` is itself a block, with fields `id`, `code`, `type`,
`identifier`, plus `status` (for `affects`) or `observedAt` (for `detectedAt`, when known).

```
{{#finding.affections}}
<div>
  <strong>[{{code}}] {{title}}</strong>
  <div>Affected assets: {{#affects}}{{identifier}}, {{/affects}}</div>
  <div>{{description}}</div>
</div>
{{/finding.affections}}
```

### References

References are grouped by type, so you can lay out CVE/CWE/CAPEC/MITRE ATT&CK/OWASP/plain-URL
references however (and wherever) makes sense for your template — or skip the types you don't
care about.

| Variable | Contains |
|---|---|
| `finding.references` | Every reference linked to the finding, regardless of type |
| `finding.cve` | Only the CVE references |
| `finding.cwe` | Only the CWE references |
| `finding.owasp` | Only the OWASP Top 10 references |
| `finding.capec` | Only the CAPEC references |
| `finding.attack` | Only the MITRE ATT&CK references |
| `finding.url` | Only the plain-URL references |

Each item has `title`, and optionally `description`/`url` when the reference entry has them;
items in `finding.references` also carry `catalog` (which of the above types they are).
A per-type variable (`finding.cve`, etc.) is only present at all when the finding has at least one
reference of that type — combined with the empty-list-collapses-to-nothing rule above, a section
for a reference type the finding doesn't have simply doesn't render.

```
{{#finding.cve}}
<h3>CVE</h3>
<ul>
  <li>{{title}}{{#url}} — <a href="{{url}}">{{url}}</a>{{/url}}</li>
</ul>
{{/finding.cve}}
```

## Severity colors

Each email template has its own severity label/color configuration — the "Severity colors"
section in the template editor — the same idea as a DOCX report template's own priority colors,
just simpler (one color per severity rather than a background/text pair, since an email badge is
plain HTML/CSS rather than a Word cell fill).

For each of `critical`/`high`/`medium`/`low`/`info` you can set a custom label and color; leaving
a label blank falls back to the bare `P0`–`P4` code, and leaving a color unset falls back to the
platform's default severity palette (the same one used for severity badges everywhere else in the
app). These are what `{{finding.severityLabel}}`/`{{finding.severityColor}}` resolve to for that
template — there's no platform-wide setting for this anymore, it's per-template so different
templates (say, an internal one vs. a client-facing one) can use different wording and colors for
the same underlying severity.

## Full example

This is the built-in "Finding report (example)" template every instance ships with:

```html
<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">

  <div style="background: {{finding.severityColor}}; color: #ffffff; padding: 14px 20px; border-radius: 6px 6px 0 0;">
    <span style="font-size: 12px; opacity: 0.85;">{{finding.code}}</span><br>
    <span style="font-size: 18px; font-weight: bold;">{{finding.title}}</span><br>
    <span style="font-size: 13px; font-weight: bold;">SEVERITY: {{finding.severityLabel}}</span>
  </div>

  <div style="border: 1px solid #e2e2e2; border-top: none; padding: 20px;">

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
      <tr>
        <td style="background: #f5f5f5; font-weight: bold;">Code</td>
        <td>{{finding.code}}</td>
      </tr>
      <tr>
        <td style="background: #f5f5f5; font-weight: bold;">Severity</td>
        <td>
          <span style="background: {{finding.severityColor}}; color: #fff; padding: 2px 8px; border-radius: 3px;">{{finding.severityLabel}}</span>
        </td>
      </tr>

      {{#finding.cve}}
      <tr>
        <td style="background: #f5f5f5; font-weight: bold;">CVE</td>
        <td>{{title}}{{#url}} — <a href="{{url}}">{{url}}</a>{{/url}}</td>
      </tr>
      {{/finding.cve}}
    </table>

    <h3>Description</h3>
    <p>{{finding.fields.description}}</p>

    {{#finding.affections}}
    <h3>Affections</h3>
    <div>
      <div><strong>[{{code}}] - {{title}}</strong></div>
      <div>Affected assets: {{#affects}}{{identifier}}, {{/affects}}</div>
      <div>{{description}}</div>
    </div>
    {{/finding.affections}}

    <h3>Impact</h3>
    <p>{{finding.fields.impact}}</p>

    <h3>Remediation</h3>
    <p>{{finding.fields.remediation}}</p>

  </div>
</div>
```

Duplicate it (Knowledge Base → Templates → Reports → Email) and adjust it as a starting point
rather than writing one from scratch.
