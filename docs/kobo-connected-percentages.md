# Connected questions and percentage modes

Conditional Kobo questions show a compact **Connected to** button. Questions without a resolved connection show **Set connection**, which opens Customize directly at Values & calculations.

**Adjust %** divides visible counts by people who answered the follow-up after its conditions and hidden-answer exclusions. **Keep original %** divides those same visible counts by the selected parent question's answered group before connection conditions or hidden-answer exclusions. Ordinary response filters still apply first.

With 100 parent respondents, 10 selecting Other, and follow-up counts 6 and 4, Adjust gives 60% and 40%; Keep original gives 6% and 4%, totaling 10%. Hiding the answer with count 6 leaves 100% in Adjust or 4% in Keep original. Actual counts determine totals: missing follow-up answers can reduce the original share; multiple-select selections can exceed it. Each breakdown and trend period has its own matching base. Repeat bases count entries in the follow-up's scope, resolving ancestor values without counting unrelated repeats.

In **Customize > Values & calculations > Connection & percentages**, select automatic Kobo conditions or define a manual tree of conditions using question, operator, and answer/value controls. AND/OR groups preserve grouping and each response is counted once. Manual rules replace detected eligibility for analysis only; they never modify the Kobo form. Choose an original base question when more than one compatible parent is referenced. A single compatible parent is selected automatically.

The **Original Kobo connection** block remains visible for both automatic and manual modes. It includes the exact stored expressions, available parent names, and missing/unresolved references. Unsupported expressions and missing answers remain visible for review rather than being guessed or removed. If no expression was stored in an older import, the interface says so explicitly.

Only supported, typed condition operators are evaluated. Unsupported automatic conditions allow Adjust using actual follow-up answers; Keep original requires a supported or complete manual rule and a valid parent. Missing manual fields or answers require repair. Question visibility and hidden parent answers do not change follow-up calculations. Count calculations use these modes; calculated measures retain their existing settings.

The settings are `connectionSource` (`automatic` or `manual`), `connectionRules` (a bounded group/rule tree), `connectedPercentageMode` (`adjust` or `keep-original`), and `percentageParent` (stable question ID). Existing `percentageBase` choices map to the corresponding modes when no explicit connected mode has been saved. Existing hidden-answer controls for unconnected questions remain unchanged. Saved views and settings transfer preserve or flag these references for repair.

Pivots, charts, totals, drilldowns, clipboard output, PDFs and native Excel reports use the same calculations. Excel source helpers separate eligibility from the original denominator and recalculate when source data or slicers change. Identifying dependency fields retain the existing Excel export restrictions. No client release is published by this change.
