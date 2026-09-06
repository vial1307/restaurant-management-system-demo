function recordFor(state, date) {
  return state?.records?.[date] ?? {};
}

export function taskDerivationFingerprint(state, date) {
  const record = recordFor(state, date);
  const settings = state?.settings ?? {};

  return JSON.stringify({
    date: String(date ?? ""),
    reservation: record.reservation ?? null,
    riceRemaining: record.riceRemaining ?? null,
    inventory: record.inventory ?? [],
    workInventory: record.workInventory ?? [],
    customTasks: record.customTasks ?? [],
    reservationBuffer: settings.reservationBuffer ?? null,
    riceWeekday: settings.riceWeekday ?? null,
    riceWeekend: settings.riceWeekend ?? null,
    riceSkipAbove: settings.riceSkipAbove ?? null,
    checklist: settings.checklist ?? [],
  });
}

function completedTaskFingerprint(completedTasks) {
  if (!completedTasks || typeof completedTasks !== "object") return "";
  return Object.keys(completedTasks)
    .filter((id) => Boolean(completedTasks[id]))
    .sort()
    .join("\u001f");
}

export function createTaskDerivationCache({ deriveTasks, summarizeProgress } = {}) {
  if (typeof deriveTasks !== "function") throw new TypeError("deriveTasks must be a function");
  if (typeof summarizeProgress !== "function") throw new TypeError("summarizeProgress must be a function");

  let taskKey = null;
  let cachedTasks = null;
  let progressKey = null;
  let cachedProgress = null;

  function tasks(state, date) {
    const nextKey = taskDerivationFingerprint(state, date);
    if (taskKey === nextKey && cachedTasks !== null) return cachedTasks;

    const nextTasks = deriveTasks(state, date);
    taskKey = nextKey;
    cachedTasks = nextTasks;
    progressKey = null;
    cachedProgress = null;
    return cachedTasks;
  }

  function progress(state, date) {
    const currentTasks = tasks(state, date);
    const completedTasks = recordFor(state, date).completedTasks ?? {};
    const nextKey = `${taskKey}\u001e${completedTaskFingerprint(completedTasks)}`;
    if (progressKey === nextKey && cachedProgress !== null) return cachedProgress;

    const nextProgress = summarizeProgress(currentTasks, completedTasks);
    progressKey = nextKey;
    cachedProgress = nextProgress;
    return cachedProgress;
  }

  function clear() {
    taskKey = null;
    cachedTasks = null;
    progressKey = null;
    cachedProgress = null;
  }

  return { tasks, progress, clear };
}
