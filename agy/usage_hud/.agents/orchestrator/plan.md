# Orchestrator Task Plan

## Phase 0: Survey & Scope Mapping
- Step 0.1: Spawn 3 Explorers (Explorer 1: Codebase structure & statusline_hud.py analysis; Explorer 2: Boundary test suite & edge cases analysis; Explorer 3: Documentation & settings.json integration requirements analysis).
- Step 0.2: Synthesize findings into PROJECT.md (Architecture, Feature Inventory, Milestones, Interface Contracts, Code Layout).

## Phase 1: Dual Track Decomposition & Execution
- Implementation Track:
  - Milestone 1: Robustness & Edge Case Fixes in statusline_hud.py (Pure ASCII, model name truncation, negative/abnormal reset times, malformed JSON).
  - Milestone 2: Documentation & Manuals (USER_GUIDE.md, TROUBLESHOOTING.md in Traditional Chinese).
- E2E Testing Track:
  - Create comprehensive boundary test suite & test infra (TEST_INFRA.md, TEST_READY.md).
- Final Milestone: Pass 100% E2E test suite + Adversarial Coverage Hardening.

## Phase 2: Final Gate & Reporting
- Verify all tests, reviewers, challengers, and auditor checks pass clean.
- Report victory to Sentinel.
