# Outcome

Mikołaj merged the verified PR zip workflow in PR #3 as `e2e5d2c`. Pull requests now run the local verification contract and expose a downloadable extension zip with manifest.json at its root. Actions run 40480741113 passed verification, packaging, and upload; the coordinator downloaded and checked the actual artifact CRC, manifest, and bundled popup. The stable check name is `Verify extension`; test artifacts are not attested releases.
