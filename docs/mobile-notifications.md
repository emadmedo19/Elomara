# Mobile notifications

Future announcements, payments, expenses, maintenance changes, and curated app releases enqueue per-device deliveries from the existing inbox transaction. Expenses reach approved building members and managers; payments and maintenance retain apartment scope. No historical inbox is replayed.

A one-minute Supabase cron invokes `deliver-mobile-notifications` using the existing Vault cron secret; the function validates its hash before reading the queue. Claims use row locking and five-minute leases; successful devices are acknowledged individually, transient failures retry up to eight attempts, and unregistered devices are removed. Android tags collapse retries for a notification. Delivery is at least once: a provider success followed by a lost acknowledgement can alert again. Expired attempts remain visible to operators in the private queue.

The compatibility `send-announcement-push` endpoint acknowledges covered event types without sending again, including calls from older APKs. Overdue and exceptional-collection paths remain available. User details and financial amounts are omitted from phone push payloads. Curated release notes contain only user-facing feature descriptions.

`release-notes.json` is published by OTA after upload, with a stable unique release ID. Routine commits reuse the ID and do not announce again. The feature requires Android notification permission and a previously registered device; operating-system restrictions or force-stop can delay delivery.

Validation: `tests/mobile_notifications.sql` runs inside a rollback transaction to verify queue fanout, leasing, duplicate release suppression, and client access restrictions. It never commits test notifications. Real-device background delivery still needs a phone check.
