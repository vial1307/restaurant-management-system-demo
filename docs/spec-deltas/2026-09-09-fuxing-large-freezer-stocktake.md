# Fuxing large-freezer stocktake — 2026-09-09

## Scope

Apply the user-supplied physical count only to `復興 / fuxing` storage location `大冷凍 / fuxing-large-freezer`.

- PostgreSQL remains the authoritative shared inventory store.
- 51 catalog/stock rows are set to the supplied count.
- Existing minimum quantities are preserved.
- No Yongji or central stock is changed.
- The import is one-time, transactional, and recorded in inventory transaction/audit history.

## Mixed package + weight counts

The current stock quantity model stores one numeric value in the item's configured unit. For inputs such as `5+3000` where the whole-package count and residual grams are both supplied but no standard package weight is defined, the import stores only the whole-package count as `quantity` and preserves the residual grams verbatim in transaction `metadata.raw_detail`.

Examples:

- `牛麵湯`: 29 whole packages; 22,560 g residual detail preserved.
- `清燉湯`: 25 whole packages; 15,160 g residual detail preserved.
- `芋頭雞湯`: 5 whole packages; 2,530 g residual detail preserved.
- `黃喉`: 4 whole packages; 880 g residual detail preserved.
- `鴨腸`: 4 whole packages; 749 g residual detail preserved.

No grams-to-package conversion is inferred.

`輕麻湯包 78+15` and `舒肥雞 11+40` are same-unit whole counts, therefore they are stored as 93 and 51 packages respectively.

`冷凍麵 1箱` follows the established branch convention of 30 slices per carton, so the authoritative quantity is 30 `片` and the original `1箱` is retained in history.

## Units supplied by the count

Explicit physical units in the count are authoritative for this stocktake, including `塊` for PR/CH/羊肩/肋眼/黃牛胸/和牛, `條` for 梅花豬 and 法國麵包, `斤` for 排骨酥, and `箱` for 草蝦.

## Deployment safety

Migration `007_fuxing_large_freezer_stocktake_20260909.sql` is guarded by the canonical production location. Isolated CI has no production location at migration time, so the data block is a no-op there while SQL syntax is still exercised. On production, all 51 rows are read back inside the same transaction; any mismatch raises an exception and rolls back the entire import. The normal VPS deployment backup is created before migrations are applied.
