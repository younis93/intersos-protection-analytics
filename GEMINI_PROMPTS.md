# Gemini prompts for Google Sheets

These prompts are intentionally separate so Gemini can work on one analytical grain at a time without modifying the raw sheets.

## Assessment sheet

Act as a senior UNHCR programme data analyst and Google Sheets dashboard developer. Work only from the raw sheet named “Assessments,” but do not edit it. Create new sheets named “Assessment Clean,” “Assessment Options,” “Assessment Pivots,” “Assessment Dashboard,” and “Assessment Data Quality.”

Use distinct Assessment ID as the primary assessment measure and distinct Beneficiary ID as a separate optional measure. Default to 2026 year-to-date. Standardize project, location, gender, UNHCR age group, Age Gender Group, nationality, community type, assessment status, detention fields and assessment date. Add Year, Quarter, Year–Quarter and Month.

Split comma-separated legal-service need and document-needed fields into normalized option rows while retaining Assessment ID and Beneficiary ID. Build KPI cards and connected #/% tables and charts for project, location, gender/age, nationality, community, status, time, legal need, documents, detention and detainee status. Percentages must use the currently filtered distinct Assessment ID denominator; identify multi-choice percentages as non-additive.

Add connected slicers for all dashboard fields. Add quality checks for missing/duplicate IDs, invalid/future dates, missing project/location/status and detained cases without detainee status. Use restrained UNHCR-blue styling, horizontal bars for bilingual categories, stacked status comparisons, heatmaps and honest time trends. Avoid 3D charts.

## Legal Services sheet

Act as a senior UNHCR programme achievement analyst and Google Sheets dashboard developer. Work from “Legal Services” and “Assessments,” but do not edit raw sheets. Create “Service Clean,” “Service Assessment Map,” “Service Pivots,” “Service Dashboard,” and “Service Data Quality.”

Use distinct Service ID as the primary volume measure and distinct Beneficiary ID as the optional reach measure. Join to Assessments using Assessment ID to inherit legal-service need, using a normalized mapping that never multiplies Service IDs. Flag unmatched Assessment IDs.

Standardize project, location, gender, age group, nationality, community, service type, document, status, start date and completion date. Add Year, Quarter, Year–Quarter and Month. Build KPIs, #/% charts and connected tables for all requested dimensions, service/status, service/document, trends and completion rates. Provide parallel Service ID and Unique Beneficiary sections if a true measure switch is unavailable.

Percentages must use the current filtered denominator. Completion rate is distinct completed Service IDs divided by filtered distinct Service IDs. Add all requested slicers and quality checks, including invalid/future dates, the observed 2002 date, missing completion dates and unmatched assessments. Use professional UNHCR-blue styling and avoid 3D charts.

## Deportation sheet

Act as a senior protection and deportation analyst and Google Sheets dashboard developer. Work only from “Deportation,” without editing it. Create “Deportation Clean,” “Deportation Pivots,” “Deportation Dashboard,” and “Deportation Data Quality.”

Use distinct PN ID as the primary measure. Standardize project, location, gender, age group, nationality, community, authority, reason, destination and date. Combine “Other” categories with their corresponding specification fields and add Year, Quarter, Year–Quarter and Month.

Build KPI cards and #/% charts and tables for demographics, community, reason, date, authority, nationality, destination, project, location, reason/destination and authority/destination. Percentages must use the currently filtered distinct PN ID denominator. Add all requested connected slicers and quality checks for IDs, age group, dates, destination, Other specifications and bilingual spelling. Use protection-sensitive UNHCR-blue styling, ranked bars, matrices and time trends; avoid 3D charts.

