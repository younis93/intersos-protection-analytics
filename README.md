# UNHCR CfP Analytics

Local, privacy-conscious analytics for assessment caseload, legal-service achievements and deportation monitoring. The original workbook is read-only; uploaded workbooks are processed in memory.

## Start the application

Run `start-dashboard.ps1` from PowerShell. The first run creates a local Python environment and installs frontend packages, then opens:

- Application: http://127.0.0.1:5173
- API documentation: http://127.0.0.1:8000/docs

The packaged Windows EXE uses a native Edge WebView2 window instead of opening a browser. The development script intentionally continues to use the browser and Vite development server.

The expected workbook sheets are `Assessments`, `Legal Services`, and `Deportation`. Use the upload button to refresh the application with a newer `.xlsx` file.

## Analytical definitions

- Assessment volume: distinct Assessment ID.
- Service volume: distinct Service ID.
- Unique beneficiary mode: distinct Beneficiary ID.
- Deportations: distinct PN ID.
- Default time window: valid 2026 year-to-date reporting dates.
- Percentages: share of the currently filtered measure.
- Multi-choice categories: percentage selecting each option; totals can exceed 100%.

The Data Quality page reports key uniqueness, completeness, validity and service-to-assessment join checks. Personally identifying narrative and contact fields are not ingested or exported.

## Interactive features

- Select categories directly in dashboard charts to cross-filter the page.
- Select month markers or month chips below a timeline to filter all dashboard results.
- Use **Clear all filters** to return to the default 2026 YTD view.
- Open **Pivot table** on any standard chart for a full-screen count and percentage table.
- Download every dashboard and Analytics Studio chart as a high-resolution **PNG** or landscape **PDF**. Exports use a clean white background and presentation-safe text regardless of the active UI theme.
- Use **Analytics Studio** to select a source sheet, one or two dimensions, the ID/beneficiary measure, chart type, pivot-table output, and filters.
- Switch themes from the header dropdown: Liquid Glass Light, Liquid Glass Dark, UNHCR Professional, or Executive Minimal.
