# Development Roadmap

This roadmap is the definitive implementation plan for building RetroVerse, aligned with the finalized architecture documents, data schemas, and the Video Playback Bridge specification.

## 1. Project Scope Summary

RetroVerse is built as a layered platform:
- RetroVerse Core Platform: shared utilities, schema validation, common services.
- Video Playback Bridge: read-only adapter that resolves `video-index.json` to safe playback objects.
- Game Engine Layer: deterministic rule engines driven by `song-registry.json` and chart datasets.
- Presentation/UI Layer: unified interactive experience for all engines.
- Data Sources: `song-registry.json`, chart datasets, `video-index.json` (authoritative).
- Deployment: local dev + local media playback, and Netlify for the UI layer.

## 2. Phase Breakdown (5 Phases)

### Phase 1 — Foundations (Weeks 1–4)
**Scope**
- Implement shared utilities in `retroverse-shared`.
- Implement and validate song-id normalization.
- Build initial dataset loaders for song registry + chart datasets.
- Implement VideoIndexLoader + validator (`video-index.schema.json`).
- Create test harness for schema validation and regression testing.

**Deliverables**
- `retroverse-shared` library with ID normalization + utilities.
- RegistryLoader and VideoIndexLoader with schema validation.
- Test harness with sample datasets and coverage reports.

**Acceptance criteria**
- Schema validation passes on target datasets.
- `songId` normalization is consistent and deterministic.
- Loaders produce indexed access by `songId`, `year`, and `artist`.

### Phase 2 — Video Playback Bridge (Weeks 5–8)
**Scope**
- Implement full lookup service with deterministic fallback rules.
- Implement error handling and missing-video behavior.
- Implement caching layer (static map or LRU).
- Implement the VideoPlayerAdapter interface.
- Integrate the bridge into a minimal UI test page.

**Deliverables**
- Video Lookup service with API contract.
- VideoPlayerAdapter that outputs a safe playback object.
- Minimal UI test page for playback verification.

**Test scenarios**
- Known `songId` returns valid playback object.
- Missing `songId` returns null or placeholder without crashing.
- Malformed records are rejected and logged.
- Multiple candidate videos resolve deterministically.

**Acceptance criteria**
- 100% of API functions produce deterministic results.
- No UI exposure of internal Video Library paths.
- Bridge remains read-only in all tests.

### Phase 3 — Game Engine Development (Weeks 9–16)
**Engines: Hit Parade, Name That Year, Song Journey, Wayback Console**

For each engine:
- **Inputs**: `song-registry.json` fields and `songId` selection rules.
- **Outputs**: structured round state + playback request by `songId`.
- **State machine**: deterministic transitions and end states.
- **Scoring**: integrated scoring template.
- **Bridge integration**: all playback via Video Playback Bridge.
- **Debug UI**: isolated engine-only testing screen.

**Milestones**
- M1: Engine state machine implemented and testable.
- M2: Scoring + difficulty scaling integrated.
- M3: Bridge integration complete with missing-video handling.
- M4: Debug UI validates at least 50 rounds per engine.

### Phase 4 — Unified RetroVerse UI (Weeks 17–22)
**Scope**
- Design front-end components and shared layout system.
- Create navigation system across engines.
- Build unified Wayback Console interface.
- Integrate user input handling and control wiring.
- Implement video playback controls via the bridge.
- Accessibility considerations (keyboard, contrast, focus states).
- Performance tuning for large datasets.

**UI acceptance criteria**
- First interactive prototype functional.
- Each engine runs end-to-end in unified UI.
- Video playback works for resolved videos.
- Accessibility baseline passes (keyboard-only flow).

### Phase 5 — Polish, Testing & Deployment (Weeks 23–26)
**Scope**
- End-to-end testing across all engines.
- Load testing (video lookup throughput).
- Final accessibility review and fixes.
- Documentation pass for all public/internal docs.
- Packaging for production.
- Deployment to Netlify.

**Go-live checklist**
- Schema validation passes on production datasets.
- All engines pass simulation tests with no crashes.
- UI performance is stable under target load.
- Netlify deployment verified with CI/CD pipeline.
- Missing-video behavior confirmed in production config.

## 3. Engineering Roles & Responsibilities

- **Data Engineer**: ingestion, normalization, schema validation, registry build.
- **Game Engine Developer**: engine logic, scoring, state machines, tests.
- **Frontend Developer**: UI components, navigation, user input, accessibility.
- **System Integrator**: bridge integration, data flow, end-to-end wiring.
- **QA Engineer**: automated tests, load testing, regression validation.

## 4. Risk Assessment & Mitigation

- **Schema drift**: enforce schema validation in all loaders; CI gate.
- **Missing video coverage**: robust fallback + placeholder policy; coverage reporting.
- **Inconsistent chart data**: normalize and log anomalies; exclude invalid rows.
- **Performance with 8k+ videos**: pre-index by `songId` and `artist`; cache hot paths.

## 5. Budget & Effort Model

**Estimated effort**
- Phase 1: 160–240 hours
- Phase 2: 160–240 hours
- Phase 3: 320–480 hours
- Phase 4: 240–360 hours
- Phase 5: 160–240 hours

**Total range**
- 1,040–1,560 hours

**Cost estimate (contractor rates)**
- $90–$140/hour
- Total: ~$94k–$218k

## 6. Success Metrics

- **Time-to-video-load**: < 400 ms for cached lookups, < 1,000 ms for cold.
- **Engine correctness rate**: ≥ 98% of rounds with valid outputs.
- **Coverage**: ≥ 90% of songs have playable video.
- **UI responsiveness**: 60 FPS target during navigation and playback control.

## 7. Maintenance & Evolution Plan

- **Versioning strategy**: semantic versioning for shared libs and bridge.
- **Extend game engines**: new engines must use `songId` and bridge APIs only.
- **Update video-index.json safely**: schema validation + diff report before publish.
- **Onboard new developers**: onboarding checklist + local dev setup guide.
- **Archive/retire datasets**: mark deprecated datasets with date and reason; keep read-only history.
