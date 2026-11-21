# W6 fixture: a benchmark change with files under a clean filter

C001-T-020, for W6 of C001-ADR-006 A1.6 (C001-T-021) and the kill tests K1 and K2 on covered files
(C001-T-022). The fixture is built, not committed: `build.ts` makes it under
`<bench root>/fixtures/w6-filtered` (default `../sdd-bench/fixtures/w6-filtered`).

```
npm run bench -- spike-evidence build-w6 [--state copy|stored]
```

What it builds:

1. A clone (`--no-hardlinks`) of the reference checkout of `bench-ts` (class-validator) on its
   branch `bench/bench-ts`: the benchmark change of C001-NFR-005, base commit unchanged.
2. Local configuration: `git lfs install --local`, and the filter `sddr-b64`
   (`filter.sddr-b64.clean/smudge = node <this folder>/b64-filter.mjs clean|smudge`, required),
   whose stored form is the file's bytes in base64, standing in for a filter such as git-crypt.
3. One commit on top of the change: `w6-fixture/.gitattributes`, 20 Git LFS files of 1 MiB
   (`w6-fixture/lfs/*.bin`) and 40 files of 16 KiB under `sddr-b64` (`w6-fixture/filtered/*.dat`),
   with deterministic content. The snapshot is the base commit to the working tree, so the
   reviewed change is the benchmark change plus these covered files.
4. The working tree in the requested state:
   - `copy`: every covered file can get its working-tree copy (LFS content matches its pointer
     file; the index stat data of the `sddr-b64` files are refreshed);
   - `stored`: no covered file can (each LFS file has its last byte changed, as an edit after
     intake; each `sddr-b64` file has a newer modification time, so G-15 reports it not up to
     date), and every covered file gets its stored form.

`npm run bench -- spike-evidence w6 --state <state>` brings the fixture to that state, then
measures. Options for other sizes: `--lfs-files N`, `--lfs-kib N`, `--filtered-files N` (they only
apply when the fixture is first built; the commit is made once). For K1 and K2, which run a test
command, install the dependencies in the fixture first (`npm ci`), as for the reference checkout.
