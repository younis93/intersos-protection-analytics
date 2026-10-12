"""Summarize saved measurements without importing application data."""
import json
import statistics
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/performance'
def read(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
def median(rows,key):return statistics.median(row[key] for row in rows)
def main():
    before=read('build-size-before.json');after=read('build-size-after.json')
    engine_before=next(a for a in before['assets'] if a['name'].startswith('plotly.min-'))
    engine_after=next(a for a in after['assets'] if a['name'].startswith('plotlyEngine-'))
    css=lambda build:next(a for a in build['assets'] if a['name'].startswith('index-') and a['name'].endswith('.css'))
    assets=read('runtime-assets.json')
    lines=['# App size and loading results','', 'Implemented while preserving analytical code, image appearance, animations and existing designs.','', '## Production size','', '| Measurement | Before | After | Reduction |','| --- | ---: | ---: | ---: |']
    for title,a,b in [('Total production directory',before['total_bytes'],after['total_bytes']),('Chart engine',engine_before['bytes'],engine_after['bytes']),('Chart engine gzip',engine_before['gzip_bytes'],engine_after['gzip_bytes']),('Initial CSS',css(before)['bytes'],css(after)['bytes']),('Public runtime assets',assets['public_before_bytes'],assets['public_after_bytes'])]:
        lines.append(f'| {title} | {a/1000000:.3f} MB | {b/1000000:.3f} MB | {(1-b/a)*100:.1f}% |')
    lines+=['','Sizes are decimal MB. Gzip is an offline size comparison; response compression was not added. Total build size includes the new Vite manifest used to verify immutable assets. The complete Windows installer was not rebuilt.','', '## Browser measurements','']
    chart=read('chart-engine.json')
    for mode in ('before','after'):
        rows=[r for r in chart['runs'] if r['mode']==mode]
        lines.append(f'- {mode.title()} engine first-chart median: {median(rows,"firstChartMs"):.0f} ms; range {min(r["firstChartMs"] for r in rows):.0f}-{max(r["firstChartMs"] for r in rows):.0f} ms.')
    lines+=['','This is a separate local HTTP engine microbenchmark using pinned distributions, five fresh contexts per engine. It includes download, parsing, execution and the first bar render; it is not a full application startup measurement.','', '| Synthetic awareness navigation | Before | After |','| --- | ---: | ---: |']
    nav_before=read('size-loading-before.json');nav_after=read('size-loading-after.json')
    for label,key in [('Page ready','ready'),('First navigation','first'),('Repeat navigation','repeat')]:lines.append(f'| {label} | {nav_before["medianMs"][key]:.0f} ms | {nav_after["medianMs"][key]:.0f} ms |')
    lines+=['','Navigation uses the same synthetic awareness-only dataset and local production preview, five runs per version. Background benchmark activity can affect timings; report size savings separately from latency and do not interpret small differences as guaranteed gains.','', '## Large imports','', '| CSV target | Duplicate-heavy | Before median (range) | After median (range) | Peak process memory after |','| --- | --- | ---: | ---: | ---: |']
    imports_before=read('import-size-before.json');imports_after=read('import-size-after.json')
    for a,b in zip(imports_before['results'],imports_after['results']):
        assert (a['target_mb'],a['duplicates'])==(b['target_mb'],b['duplicates'])
        assert a['samples'][0]['result_sha256']==b['samples'][0]['result_sha256'],'Import results changed'
        x=a['summary']['import_ready_seconds'];y=b['summary']['import_ready_seconds']
        lines.append(f'| {a["target_mb"]} MB | {a["duplicates"]} | {x["median"]:.2f}s ({x["min"]:.2f}-{x["max"]:.2f}) | {y["median"]:.2f}s ({y["min"]:.2f}-{y["max"]:.2f}) | {b["summary"]["peak_process_mb"]["max"]:.0f} MB |')
    lines+=['','Five fresh processes per scenario/version. Actual byte counts, row counts, stage timings and query-result digests are retained in the raw JSON. These frontend/static-serving changes do not optimize backend import computation. Peak process memory includes fixture generation; it is not incremental import allocation.','', '## Local filters and bottlenecks','']
    local_before=read('local-filters-before.json');local_after=read('local-filters-after.json')
    lines.append(f'The local CSV source is {local_after["actual_bytes"]/1000000:.1f} MB. Its byte fingerprint was unchanged after profiling. Imports used temporary copies and standalone stores, with no active workspace persistence. Median local import: {median(local_before["imports"],"seconds"):.2f}s before and {median(local_after["imports"],"seconds"):.2f}s after.')
    lines+=['','| Query | Before cold / warm | After cold / warm |','| --- | ---: | ---: |']
    ranked=sorted(local_after['queries'].items(),key=lambda item:-item[1]['cold']['median_ms'])[:8]
    for name,values in ranked:
        previous=local_before['queries'][name]
        lines.append(f'| {name} | {previous["cold"]["median_ms"]:.0f} / {previous["warm"]["median_ms"]:.0f} ms | {values["cold"]["median_ms"]:.0f} / {values["warm"]["median_ms"]:.0f} ms |')
    lines+=['','Cold means isolated store query caches were cleared, retaining import-prepared indexes; warm repeats the identical query. Each condition has five samples, with ranges and response byte counts in the JSON. Cold/warm result digests matched.','', 'Recommended follow-ups, outside this implementation:','', '1. Reduce repeated Overview scope/filter-option work, particularly _overview_filter_options. Warm single-project requests still require substantial computation; cache keys must include the dataset revision and complete filter selection.','2. Reduce repeated name matching and ID normalization in duplicate-heavy review preparation (_name_match_flags and clean_id). Use the separate CPU profiles and import stage timings to target work while preserving exact finding output.','3. Investigate cold high-cardinality Explorer option preparation and search. Warm requests benefit from existing caches; optimize cold preparation without changing truncation or unavailable-value rules.','', 'The browser filter report separates server request durations, response bytes, request counts and main-thread long tasks. Search interaction timings include deliberate settle waits and are upper-bound samples. Server timing includes scheduling and middleware, not CPU alone.','', '## Verification','', '- 245 frontend tests passed; production TypeScript/Vite build passed.','- Backend suite: 483 passed, 5 skipped; final static cache and desktop startup checks passed.','- All supported Plotly traces rendered and exported PNG/SVG; existing chart checks passed PNG/PDF, hover, selection, pivots, Arabic alignment and mobile layouts.','- Shared UI and deferred-page checks passed, including partial imports, direct links, retry/reload and module reuse.','- Computed-style comparison against the original stylesheet covers five themes and two viewports; ambiguous shared/cascade-sensitive rules remain global.','- Production caching check confirmed manifest-verified immutable assets, 304 responses, cached reloads, HTML/API no-store, unhashed revalidation and uncached failures.','- Asset audit excludes archived runtime variants and design files, checks runtime references and confirms one deferred chart engine.','', 'No broad backend optimization, analytical change, service worker or compression middleware was introduced. The deferred chart chunk still exceeds the build warning threshold.']
    publication=read('local-publication.json')
    lines.append(f'\nIsolated local publication measured {publication["publication_seconds"]*1000:.2f} ms after import; this excludes browser upload/network time. Synthetic import measurements stop at prepared metadata and exclude HTTP publication.')
    lines+=['','## Browser filter observations','', '| Scenario | Ready time | API responses | Response bytes | Summed server time | Long tasks |','| --- | ---: | ---: | ---: | ---: | ---: |']
    browser=read('browser-filters-after.json')['runs']
    for label in ('overview_initial_with_chart','overview_single','overview_reset','explorer_empty','explorer_rapid','studio_first','review_empty','revision_reload'):
        rows=[row for row in browser if row['label']==label]
        lines.append(f'| {label} | {median(rows,"interactionToReadyMs"):.0f} ms | {median(rows,"requestCount"):.0f} | {median(rows,"responseBytes"):.0f} | {median(rows,"serverRequestMs"):.0f} ms | {median(rows,"longTaskCount"):.0f} |')
    lines+=['','After-only observations on the isolated local-data server, five fresh browser contexts. API counts include background loading; concurrent server durations overlap. Search timings include deliberate settle waits and are upper bounds. Raw JSON retains per-run main-thread long-task duration.','', '## Separate CPU profiles','']
    for filename,key in [('import-cpu.json','profile'),('local-filter-cpu.json','profiles')]:
        profile=read(filename)[key]
        lines.append(f'- `{filename}`: '+', '.join(f'{row["module"]}:{row["function"]} ({row["cumulative_seconds"]:.2f}s cumulative)' for row in profile[:5])+'.')
    lines+=['','CPU profiles ran separately after all timing suites. Cumulative entries include child calls and must not be added together. Profiles contain function names and aggregate timings, without record values.','', 'The existing disabled mascot feature flag is unchanged. Its referenced animations and reduced-motion posters remain packaged; no currently visible animation was removed.']
    lines.append('\nTemporary browser-server copies were preserved under ignored `tmp/size-loading/isolated-server-*`, outside production output. Original source CSVs and active application persistence were not changed.')
    lines.append('\nStatic cache reuse was verified within the same origin/session. The desktop launcher selects a free port and uses private browsing, so these cache benefits do not imply reuse across separate desktop launches. Those privacy/startup settings remain unchanged.')
    (OUT/'size-loading-summary.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(OUT/'size-loading-summary.md')

if __name__=='__main__':main()
