from pathlib import Path

sync_path = Path("src/business-state-sync.js")
sync = sync_path.read_text(encoding="utf-8")

old_write = '''function writeRecoveryDraft(draft) {
  try {
    const state = recoveryState();
    const key = `${draft.userId}:${draft.site}`;
    state.drafts[key] = draft;
    const entries = Object.entries(state.drafts)
      .sort((a, b) => String(b[1]?.capturedAt || "").localeCompare(String(a[1]?.capturedAt || "")))
      .slice(0, MAX_RECOVERY_DRAFTS);
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, drafts: Object.fromEntries(entries) }));
    return true;
  } catch {
    return false;
  }
}'''
new_write = '''function writeRecoveryDraft(draft) {
  try {
    const state = recoveryState();
    const key = `${draft.userId}:${draft.site}`;
    const previous = state.drafts[key] && typeof state.drafts[key] === "object" ? state.drafts[key] : null;
    const previousModules = previous?.modules && typeof previous.modules === "object" && !Array.isArray(previous.modules)
      ? previous.modules
      : {};
    const incomingModules = draft?.modules && typeof draft.modules === "object" && !Array.isArray(draft.modules)
      ? draft.modules
      : {};
    const changedModules = [...new Set([
      ...(Array.isArray(previous?.changedModules) ? previous.changedModules : Object.keys(previousModules)),
      ...(Array.isArray(draft?.changedModules) ? draft.changedModules : Object.keys(incomingModules)),
    ].map(String).filter(Boolean))];
    state.drafts[key] = {
      ...(previous || {}),
      ...draft,
      capturedAt: draft.capturedAt || previous?.capturedAt || new Date().toISOString(),
      changedModules,
      modules: {
        ...structuredClone(previousModules),
        ...structuredClone(incomingModules),
      },
    };
    const entries = Object.entries(state.drafts)
      .sort((a, b) => String(b[1]?.capturedAt || "").localeCompare(String(a[1]?.capturedAt || "")))
      .slice(0, MAX_RECOVERY_DRAFTS);
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, drafts: Object.fromEntries(entries) }));
    return true;
  } catch {
    return false;
  }
}'''
if sync.count(old_write) != 1:
    raise SystemExit(f"writeRecoveryDraft anchor count={sync.count(old_write)}")
sync = sync.replace(old_write, new_write)

old_catch = '''      } catch (error) {
        emitPersistenceStatus("error", { userId, site, modules: dirtyNames, error:error.message });
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"error", site, error:error.message } }));
        return false;
      }'''
new_catch = '''      } catch (error) {
        if (error?.code === "BUSINESS_STATE_CONFLICT" && error?.payload) {
          const conflictingNames = [...new Set((error.payload.conflictingModules || [])
            .map(String)
            .filter((name) => Object.hasOwn(dirtyModules, name)))];
          const serverModules = error.payload.modules && typeof error.payload.modules === "object" && !Array.isArray(error.payload.modules)
            ? error.payload.modules
            : {};
          const serverRevisions = normalizedModuleRevisions(error.payload.moduleRevisions);
          const hasAuthoritativeConflict = conflictingNames.length > 0 && conflictingNames.every((name) => (
            Object.hasOwn(serverModules, name) && Number.isInteger(serverRevisions[name])
          ));
          if (hasAuthoritativeConflict) {
            const capturedAt = new Date().toISOString();
            const conflictLocalModules = Object.fromEntries(
              conflictingNames.map((name) => [name, structuredClone(dirtyModules[name])])
            );
            const recoverySaved = writeRecoveryDraft({
              userId,
              site,
              capturedAt,
              baseRevision: loadedRevisionKey === key && Number.isFinite(loadedRevision) ? loadedRevision : null,
              changedModules: conflictingNames,
              modules: conflictLocalModules,
              reason: "concurrency-conflict",
            });
            if (recoverySaved) {
              const baseline = snapshotModules(lastSavedSnapshot);
              const authoritativeModules = Object.fromEntries(
                conflictingNames.map((name) => [name, structuredClone(serverModules[name])])
              );
              applyingRemote = true;
              try {
                store.mergeBusinessModules(authoritativeModules);
              } finally {
                applyingRemote = false;
              }
              for (const name of conflictingNames) baseline[name] = structuredClone(authoritativeModules[name]);
              lastSavedSnapshot = JSON.stringify(baseline);
              if (loadedModuleRevisionKey !== key) loadedModuleRevisions = {};
              for (const name of conflictingNames) loadedModuleRevisions[name] = serverRevisions[name];
              loadedModuleRevisionKey = key;
              const remainingDirty = dirtyBusinessModules(businessModulesFromState(store.getState()), lastSavedSnapshot);
              capturePendingOrError(key, userId, site, remainingDirty);
              emitPersistenceStatus("error", { userId, site, modules: conflictingNames, error:"BUSINESS_STATE_CONFLICT" });
              window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
                detail:{ status:"recovery-pending", site, modules:conflictingNames, error:"BUSINESS_STATE_CONFLICT", capturedAt },
              }));
              if (Object.keys(remainingDirty).length) scheduleSave();
              return false;
            }
          }
        }
        emitPersistenceStatus("error", { userId, site, modules: dirtyNames, error:error.message });
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"error", site, error:error.message } }));
        return false;
      }'''
if sync.count(old_catch) != 1:
    raise SystemExit(f"save catch anchor count={sync.count(old_catch)}")
sync_path.write_text(sync.replace(old_catch, new_catch), encoding="utf-8")

notice_path = Path("src/business-recovery-notice.js")
notice = notice_path.read_text(encoding="utf-8")
old_copy = '''  copy.textContent = lang === "zh"
    ? "因權限或工作據點已變更，仍有資料尚未同步。復原副本已保留在此裝置；管理者處理前請勿清除瀏覽器資料。"
    : "Có dữ liệu chưa thể đồng bộ do quyền hoặc nơi làm việc đã thay đổi. Bản phục hồi đang được giữ trên thiết bị; không xóa dữ liệu trình duyệt trước khi quản lý xử lý.";'''
new_copy = '''  copy.textContent = lang === "zh"
    ? "因權限、工作據點變更或同時編輯衝突，仍有資料尚未同步。復原副本已保留在此裝置；管理者處理前請勿清除瀏覽器資料。"
    : "Có dữ liệu chưa thể đồng bộ do quyền, nơi làm việc hoặc xung đột chỉnh sửa đồng thời. Bản phục hồi đang được giữ trên thiết bị; không xóa dữ liệu trình duyệt trước khi quản lý xử lý.";'''
if notice.count(old_copy) != 1:
    raise SystemExit(f"recovery copy anchor count={notice.count(old_copy)}")
notice_path.write_text(notice.replace(old_copy, new_copy), encoding="utf-8")

test_path = Path("tests/business-state-module-revision-regression.mjs")
test = test_path.read_text(encoding="utf-8")
old_storage = '''const storage = new Map([["shitu-kitchen-auth-v1", JSON.stringify({
  id: "revision-user", location: "fuxing", permissions: { settings: { view: true, edit: true } },
})]]);'''
new_storage = '''const storage = new Map([
  ["shitu-kitchen-auth-v1", JSON.stringify({
    id: "revision-user", location: "fuxing", permissions: { settings: { view: true, edit: true } },
  })],
  ["shitu-business-recovery-v1", JSON.stringify({ version:1, drafts:{
    "revision-user:fuxing": {
      userId:"revision-user", site:"fuxing", capturedAt:"2026-09-08T00:00:00.000Z",
      changedModules:["reservations"], reason:"authorization-transition",
      modules:{ reservations:{ records:{ legacy:true } } },
    },
  } })],
]);'''
if test.count(old_storage) != 1:
    raise SystemExit(f"test storage anchor count={test.count(old_storage)}")
test = test.replace(old_storage, new_storage)

old_payload = '    error.payload = { error: "BUSINESS_STATE_CONFLICT", conflictingModules: ["settings"], moduleRevisions: { settings: 14 } };'
new_payload = '    error.payload = { error: "BUSINESS_STATE_CONFLICT", conflictingModules: ["settings"], moduleRevisions: { settings: 14 }, modules: { settings: { reservationBuffer: 99 } } };'
if test.count(old_payload) != 1:
    raise SystemExit(f"conflict payload anchor count={test.count(old_payload)}")
test = test.replace(old_payload, new_payload)

old_assertions = '''assert.equal(state.settings.reservationBuffer, 6, "conflict overwrote the current local edit");
assert.equal(reads, readsBeforeConflict, "conflict triggered a stale GET over the local edit");
const conflictStatus = persistence.findLast((entry) => entry?.status === "error");
assert.equal(conflictStatus?.error, "BUSINESS_STATE_CONFLICT");
assert.notEqual(persistence.at(-1)?.status, "saved", "conflicting write emitted false saved status");'''
new_assertions = '''assert.equal(state.settings.reservationBuffer, 99, "conflict did not reconcile the visible module to authoritative server state");
assert.equal(reads, readsBeforeConflict, "conflict triggered an unnecessary GET instead of using the conflict payload");
const recoveryState = JSON.parse(storage.get("shitu-business-recovery-v1") || "{}");
const recoveryDraft = recoveryState.drafts?.["revision-user:fuxing"];
assert(recoveryDraft, "conflicting local edit was not preserved as a recovery draft");
assert.equal(recoveryDraft.reason, "concurrency-conflict");
assert.deepEqual(new Set(recoveryDraft.changedModules), new Set(["reservations", "settings"]), "new conflict recovery overwrote an existing recovery module");
assert.equal(recoveryDraft.modules?.reservations?.records?.legacy, true, "existing recovery payload was lost during conflict capture");
assert.equal(recoveryDraft.modules?.settings?.reservationBuffer, 6, "conflicting local value was not preserved in recovery storage");
const pendingState = JSON.parse(storage.get("shitu-business-pending-v1") || "{}");
assert.equal(pendingState.drafts?.["revision-user:fuxing"], undefined, "stale conflicting pending draft survived conflict reconciliation");
assert(stateStatuses.some((entry) => entry?.status === "recovery-pending" && entry?.error === "BUSINESS_STATE_CONFLICT"), "conflict did not surface the recovery-pending state");
const conflictStatus = persistence.findLast((entry) => entry?.status === "error");
assert.equal(conflictStatus?.error, "BUSINESS_STATE_CONFLICT");
assert.notEqual(persistence.at(-1)?.status, "saved", "conflicting write emitted false saved status");'''
if test.count(old_assertions) != 1:
    raise SystemExit(f"conflict assertions anchor count={test.count(old_assertions)}")
test_path.write_text(test.replace(old_assertions, new_assertions), encoding="utf-8")

spec_lines = [
    "# SDD Delta — Business-state conflict recovery",
    "",
    "Date: 2026-09-08",
    "Base production: `262646e8037748a0ee999ec0b433b22cfc9966b6`",
    "Priority: P1 data-safety / multi-user reconciliation",
    "",
    "## Problem",
    "",
    "The server already rejects stale module writes with `BUSINESS_STATE_CONFLICT`, but the browser retained the conflicting local module in a pending draft with the stale expected revision. Reload/focus could therefore retry the same stale token indefinitely.",
    "",
    "A second recovery capture for the same user/site also replaced the previous recovery draft wholesale, risking loss of an earlier unsynchronized module copy.",
    "",
    "## Required behavior",
    "",
    "- never auto-overwrite the server after a concurrency conflict;",
    "- preserve the local value of every conflicting module in device recovery storage;",
    "- merge new recovery modules into an existing user/site recovery draft instead of discarding older recovery modules;",
    "- reconcile the visible conflicting module to the authoritative module snapshot returned by the 409 response;",
    "- advance the accepted token only to the authoritative revision returned for that conflicting module;",
    "- remove the stale conflicting module from the pending-save draft so it cannot retry forever;",
    "- continue saving unrelated non-conflicting dirty modules independently;",
    "- if recovery storage cannot be written, keep the old local/pending state and surface an error instead of discarding data;",
    "- do not change backend, database schema, permissions or inventory semantics.",
    "",
    "## Acceptance",
    "",
    "The module-revision runtime regression must prove the conflicting local value survives in recovery storage, an existing recovery module remains present, visible state adopts the server snapshot, the stale pending draft is cleared, and no extra GET or false saved status is emitted. Full API/PostgreSQL/browser/full-device gates remain mandatory before merge.",
]
Path("docs/spec-deltas/2026-09-08-business-conflict-recovery.md").write_text("\n".join(spec_lines) + "\n", encoding="utf-8")
