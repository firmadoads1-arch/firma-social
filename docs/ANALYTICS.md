# Instagram performance

Open `/?view=analytics` for views of Reels and Stories, account comparison, ranking, patterns and operational alerts. Data is owner-scoped even while the Site is public.

## Authorization

Publishing uses `instagram_business_basic,instagram_business_content_publish` as before. The explicit **Autorizar métricas** action requests the additional `instagram_business_manage_insights` scope. Normal connections are unchanged. The optional Insights variant of a device link is `/connect?insights=1#<existing-link-token>` and still requires official OAuth consent; it gives no dashboard access. Enable Insights in the Meta application and obtain the necessary access level/review for accounts outside app roles. Never mark a permission granted just because it was requested.

## Collection and limits

- `GET /api/analytics?days=7|30|90&accountId=<optional>` returns saved measurements, never credentials. The date filter refers to publication dates; values are lifetime measurements as of the last collection, not views earned within the filter window.
- `GET /api/analytics?status=1` returns sanitized per-account checkpoints and due work.
- `POST /api/analytics` with `{}` selects the oldest due Instagram account; `{ "accountId": "<owned UUID>" }` selects one. Same-origin, authenticated managers or the existing configured Site service credential only.
- One step discovers up to 25 Stories and 25 media objects and measures up to 8 media objects; pagination is resumed through saved cursors. Only validated `after` cursor values are used; provider `paging.next` URLs are never followed. All reads target `graph.instagram.com` with the account token in an Authorization header; redirects are rejected.
- Stories are prioritized while active and their last collected values survive expiry. Stories that expired before collection cannot be recovered by this implementation. Retention is 90 days. Reels/feed history is discovered to 90 days. New discovery stops after a known page on subsequent cycles.
- Recent content is measured hourly when the collector runs. Ages 2–7 days are refreshed at most every 6 hours, 7–30 days daily, older content weekly. A 2-minute lease prevents overlapping steps; permission errors back off for 6 hours, transient errors for 15 minutes. OAuth renewal makes the account eligible again.
- Missing fields/empty results stay null, never zero. Unsupported extended metrics fall back to views/reach. Last known measurements remain visible after a failed or empty read with their actual measurement date.
- Reports display at most 5,000 matching contents and explicitly indicate truncation; narrow to an account or smaller period. No 100-account throughput guarantee has been validated.
- Operational health covers expiry/revocation, collection status and local delivery failures/delays. It is **not** Meta Account Status, recommendation eligibility or shadowban detection.
- Relative ranking requires five other posts from the same account, format and age band (0–24h, 1–7d, 7d+). Patterns require three comparable observations; ratios are medians, not a predictive AI model. A 3× outlier is an observed signal, not a promise of viral reach.

## Unattended update

Reuse the Site's existing enabled queue task, preserving the queue protocol in `docs/QUEUE_RUNNER.md`. After the queue work, run `python scripts/analytics-service.py` from the current Site source. It reads one line of JSON on hidden stdin: `{ "url": "<get_site.current_live_url>", "token": "<get_site.siwc_bypass_bearer_token>", "mode": "run" }`. Never put the token in arguments, files, logs, prompts or replies. It sends the same existing credential only to this Site in `OAI-Sites-Authorization` and `Authorization` (both Bearer), with `x-firma-service: queue-v1`, without Origin.

The helper first reads status, calls the due account step and reads status again, requiring the stored `lastAttemptAt` to equal the response's `checkedAt`. It performs at most 200 bounded steps. Stop on ambiguous transport/readback errors and inspect status before any new POST. Respect leases and `nextSyncAt`; do not force/replay an in-flight request. A following invocation starts with status. Empty queues are normal; keep the recurring task enabled. Notify only failures requiring intervention; the in-app alerts remain visible without sending messages to third parties.

The collector only writes `analytics_media` and `analytics_sync`; it never publishes, edits content, refreshes tokens, grants consent or changes connections. The latest measurements and expired Story history are included in portable backups; old backups without analytics tables are still accepted. Backup size limits continue to apply.

## References

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/insights/
- https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
- https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights/
