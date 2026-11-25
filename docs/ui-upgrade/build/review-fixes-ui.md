# Review fixes: screens (fix agent C) - reconstructed

This note was missing when the re-test ran. It was written afterwards from `git log --stat` (commits 68fc768, 19b5ab3, 842a24a), the QA report (`07-qa-report.md`) and the re-test (`08-retest.md`). It lists what the screen fixes changed, no more. If a detail is not in those three sources it is not here.

| Item | What changed |
|---|---|
| B-1 | The deals action no longer hides the database reason behind one generic message; the database part (record stays when a deal is deleted) is in `review-fixes-db.md`. |
| B-2 | The side panel gives focus back to the name link that opened it (Creators and Sponsors). |
| B-3 | Add deal refuses a Do not contact creator or sponsor, like the Link dialog. |
| B-4 | In "Add a record", an unknown sponsor name no longer creates a sponsor silently: the person must press "Add <name> as a new sponsor"; Save stays disabled until then. |
| B-5, C-3 | Sponsor names of any shape work in practice drafts; "Your channel" starts with a capital (see `review-fixes-outreach.md`). |
| B-6 | The From and To fields keep the last good range and the address and boxes agree. |
| C-1, C-2, C-4 to C-9 | Empty-state text, capital letter in the price reason, "Remove ..." suggestions on the Sponsors empty state, one wording for saved views (with a confirm step on Delete), "Sponsor" instead of "Brand" on Deals, a sponsor-specific 404 page, a line saying Delete lives in the table view, "Sep" instead of "Sept". |
| SR-08, SR-09, SR-10, SR-11, SR-13, SR-17 | Audit lines for profile and email views, link checks on video links, login check before page titles, 1 MB limit on both import routes, opt-out note on the Review card, recently opened list cleared at log out. |
| Tests | `tests/qa.e2e.cjs` got a section "10. review fixes (screens)"; the deals, profile and sponsors browser tests were updated for the new wording. |

What the screen fixes did not do (found by the re-test, handled in `retest-fixes.md`): the sponsor profile still wrote an extra "viewed" line after its own edits, Approve on a draft with no contact address still worked, the stray "x" beside a tag chip, and no message after deleting a deal in the table view.
