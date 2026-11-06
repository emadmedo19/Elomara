# Branch review — 2026-11-06

Compared with main at `6d472f4657ef136033880695daf7b030ce5e4f91` before the main-only policy change. Branches have not been deleted. Ahead/behind counts describe ancestry, not whether equivalent changes were squash-merged or superseded. Do not merge old recovery branches wholesale.

| Branch | Head SHA | Ahead | Behind |
| --- | --- | ---: | ---: |
| feature/anonymous-polls | 6f5556830e19adf34b86d9c0bb2a0a793a370dcf | 11 | 6 |
| feature/multi-tenant-buildings | b5489fe6548338a49e67600c2c28291a8bee4190 | 13 | 71 |
| feature/restore-email-auth-exceptional-collections | 625c6059c5e5d6c3d64a7225f7ab39ca54ee9150 | 20 | 1 |
| fix/auth-bootstrap-403-nov05 | ae558dfea5c05d9576a7fd905e743b0327fa0533 | 100 | 62 |
| fix/ota-apply-update-immediately | f9f6b660d964f5df599f1844c9fb6acf14e10f2a | 0 | 5 |
| fix/resident-mobile-layout-v2 | 9e308eb8b455437d3f82c459faa176bccf7a7e62 | 12 | 71 |
| fix/resident-portal-mobile-layout | 0bc144c868c5b2ecb226b5b5fe94dfc0c88f5520 | 9 | 71 |
| fix/tailwind-oxide-install | 6bbffd9727a51d55307c644fa6cafdd255501a52 | 1 | 2 |
| migration/multi-tenant-isolation | cd0c7f2e7e577c70005a4ddfdf284489a8040192 | 71 | 62 |
| recovery/google-only-stable-nov04 | 2bcba52fa392157cc4b530692457f2db51696f00 | 67 | 62 |
| recovery/nov04-11pm-stable | 2bcba52fa392157cc4b530692457f2db51696f00 | 67 | 62 |
| recovery/nov04-2300-stable | 2bcba52fa392157cc4b530692457f2db51696f00 | 67 | 62 |
| recovery/phone-auth-compatible-nov05 | d7d07798f14384fc9855e7820c5a8704a2b0fa73 | 2 | 21 |
| recovery/phone-auth-nov04 | cd0c7f2e7e577c70005a4ddfdf284489a8040192 | 71 | 62 |

`fix/ota-apply-update-immediately` is already contained in main. Other branches require content review before deletion. The connected GitHub tool supports file updates but does not expose branch deletion, and local Git access failed because the configured proxy could not be reached. SHA references here are an inventory, not a durable backup of unmerged commits.
