const REPOSITORY = "vial1307/restaurant-management-system-demo";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
export const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { value:null, expiresAt:0 };
let inFlight = null;

function text(value) {
  return String(value ?? "").trim();
}

function githubHeaders() {
  const token = text(process.env.GITHUB_READ_TOKEN);
  return {
    accept:"application/vnd.github+json",
    "user-agent":"kitchen-os-live-handoff",
    "x-github-api-version":"2022-11-28",
    ...(token ? { authorization:`Bearer ${token}` } : {}),
  };
}

async function githubJson(path) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    headers:githubHeaders(),
    signal:AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    const error = new Error(`GITHUB_API_${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return response.json();
}

function pullSummary(pr) {
  if (!pr) return null;
  return {
    number:pr.number,
    title:text(pr.title),
    body:text(pr.body).slice(0,12000),
    url:text(pr.html_url),
    branch:text(pr.head?.ref),
    head_sha:text(pr.head?.sha),
    base_branch:text(pr.base?.ref),
    base_sha:text(pr.base?.sha),
    draft:Boolean(pr.draft),
    created_at:pr.created_at || null,
    updated_at:pr.updated_at || null,
    author:text(pr.user?.login),
  };
}

async function loadLiveGithubHandoff() {
  const pulls = await githubJson("/pulls?state=open&sort=updated&direction=desc&per_page=10");
  const candidates = Array.isArray(pulls)
    ? pulls.filter((pr) => pr?.head?.repo?.full_name === REPOSITORY)
    : [];
  const active = candidates.find((pr) => !pr.draft) || candidates[0] || null;
  const activePr = pullSummary(active);

  let commits = [];
  let files = [];
  let runs = [];
  if (activePr) {
    const [commitRows,fileRows,actionData] = await Promise.all([
      githubJson(`/pulls/${activePr.number}/commits?per_page=20`),
      githubJson(`/pulls/${activePr.number}/files?per_page=100`),
      githubJson(`/actions/runs?branch=${encodeURIComponent(activePr.branch)}&per_page=30`),
    ]);
    commits = (Array.isArray(commitRows) ? commitRows : []).slice(-8).reverse().map((row) => ({
      sha:text(row.sha),
      short_sha:text(row.sha).slice(0,12),
      message:text(row.commit?.message).split("\n")[0],
      url:text(row.html_url),
      author:text(row.author?.login || row.commit?.author?.name),
      date:row.commit?.author?.date || null,
    }));
    files = (Array.isArray(fileRows) ? fileRows : []).map((row) => ({
      path:text(row.filename),
      status:text(row.status),
      additions:Number(row.additions || 0),
      deletions:Number(row.deletions || 0),
    }));
    runs = (Array.isArray(actionData?.workflow_runs) ? actionData.workflow_runs : [])
      .filter((run) => !activePr.head_sha || run.head_sha === activePr.head_sha)
      .slice(0,20)
      .map((run) => ({
        id:run.id,
        name:text(run.name),
        run_number:run.run_number,
        event:text(run.event),
        status:text(run.status),
        conclusion:run.conclusion || null,
        url:text(run.html_url),
        head_sha:text(run.head_sha),
        created_at:run.created_at || null,
        updated_at:run.updated_at || null,
      }));
  }

  return {
    available:true,
    stale:false,
    source:"github-api-live",
    generated_at:new Date().toISOString(),
    cache_ttl_seconds:CACHE_TTL_MS / 1000,
    repository:{ name:REPOSITORY,url:REPOSITORY_URL },
    canonical_url:PUBLIC_HANDOFF_URL,
    active_pr:activePr,
    open_pull_requests:candidates.slice(0,5).map(pullSummary),
    commits,
    changed_files:files,
    workflows:runs,
  };
}

export async function getLiveGitHubHandoff({ force=false } = {}) {
  const now = Date.now();
  if (!force && cache.value && cache.expiresAt > now) return cache.value;
  if (inFlight) return inFlight;

  inFlight = loadLiveGithubHandoff()
    .then((value) => {
      cache = { value,expiresAt:Date.now() + CACHE_TTL_MS };
      return value;
    })
    .catch((error) => {
      if (cache.value) {
        return {
          ...cache.value,
          available:false,
          stale:true,
          error:text(error?.message || "GITHUB_API_UNAVAILABLE"),
          generated_at:new Date().toISOString(),
        };
      }
      return {
        available:false,
        stale:false,
        source:"github-api-live",
        generated_at:new Date().toISOString(),
        cache_ttl_seconds:CACHE_TTL_MS / 1000,
        repository:{ name:REPOSITORY,url:REPOSITORY_URL },
        canonical_url:PUBLIC_HANDOFF_URL,
        active_pr:null,
        open_pull_requests:[],
        commits:[],
        changed_files:[],
        workflows:[],
        error:text(error?.message || "GITHUB_API_UNAVAILABLE"),
      };
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}
