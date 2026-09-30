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

async function githubTextFile(path, ref="main") {
  const row = await githubJson(`/contents/${path}?ref=${encodeURIComponent(ref)}`);
  const encoded = text(row?.content).replace(/\s+/g,"");
  const content = encoded ? Buffer.from(encoded,"base64").toString("utf8") : "";
  return { path,sha:text(row?.sha),content };
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

function commitSummary(row) {
  return {
    sha:text(row?.sha),
    short_sha:text(row?.sha).slice(0,12),
    message:text(row?.commit?.message).split("\n")[0],
    url:text(row?.html_url),
    author:text(row?.author?.login || row?.commit?.author?.name),
    date:row?.commit?.author?.date || null,
  };
}

function workflowSummary(run) {
  return {
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
  };
}

function handoffTitle(content) {
  const match = String(content || "").match(/^##\s+(.+)$/m);
  return text(match?.[1] || "");
}

function explicitActivePrNumber(content) {
  const source=String(content || "");
  const match = source.match(/^\s*(?:[-*]\s*)?(?:ACTIVE_PR|Active PR|Current active PR|PR đang làm)\s*[:=]\s*#?(\d+)\s*$/im);
  return match ? Number(match[1]) : null;
}

async function loadLiveGithubHandoff() {
  const [mainBranch,currentHandoff,pulls] = await Promise.all([
    githubJson("/branches/main"),
    githubTextFile("docs/CURRENT_HANDOFF.md","main"),
    githubJson("/pulls?state=open&sort=updated&direction=desc&per_page=20"),
  ]);

  const mainSha=text(mainBranch?.commit?.sha);
  const candidates = Array.isArray(pulls)
    ? pulls.filter((pr) => pr?.head?.repo?.full_name === REPOSITORY)
    : [];

  // CURRENT_HANDOFF.md is the authority. An open PR becomes "active" only
  // when that document explicitly names it. Never promote the newest open PR
  // automatically: old/parallel PRs can remain open for weeks.
  const requestedPrNumber=explicitActivePrNumber(currentHandoff.content);
  const active = requestedPrNumber
    ? candidates.find((pr)=>Number(pr.number)===requestedPrNumber) || null
    : null;
  const activePr = pullSummary(active);

  const [mainCommitRows,mainActionData] = await Promise.all([
    githubJson("/commits?sha=main&per_page=8"),
    githubJson("/actions/runs?branch=main&per_page=30"),
  ]);
  const mainCommits=(Array.isArray(mainCommitRows) ? mainCommitRows : []).map(commitSummary);
  const mainRuns=(Array.isArray(mainActionData?.workflow_runs) ? mainActionData.workflow_runs : [])
    .filter((run)=>!mainSha || run.head_sha===mainSha)
    .slice(0,20)
    .map(workflowSummary);

  let commits=mainCommits;
  let files=[];
  let runs=mainRuns;
  if(activePr){
    const [commitRows,fileRows,actionData]=await Promise.all([
      githubJson(`/pulls/${activePr.number}/commits?per_page=20`),
      githubJson(`/pulls/${activePr.number}/files?per_page=100`),
      githubJson(`/actions/runs?branch=${encodeURIComponent(activePr.branch)}&per_page=30`),
    ]);
    commits=(Array.isArray(commitRows)?commitRows:[]).slice(-8).reverse().map(commitSummary);
    files=(Array.isArray(fileRows)?fileRows:[]).map((row)=>({
      path:text(row.filename),
      status:text(row.status),
      additions:Number(row.additions || 0),
      deletions:Number(row.deletions || 0),
    }));
    runs=(Array.isArray(actionData?.workflow_runs)?actionData.workflow_runs:[])
      .filter((run)=>!activePr.head_sha || run.head_sha===activePr.head_sha)
      .slice(0,20)
      .map(workflowSummary);
  }

  return {
    available:true,
    stale:false,
    source:"github-api-live",
    authority:"main-current-handoff",
    generated_at:new Date().toISOString(),
    cache_ttl_seconds:CACHE_TTL_MS / 1000,
    repository:{ name:REPOSITORY,url:REPOSITORY_URL },
    canonical_url:PUBLIC_HANDOFF_URL,
    main:{
      branch:"main",
      sha:mainSha,
      short_sha:mainSha.slice(0,12),
      url:`${REPOSITORY_URL}/tree/main`,
      commit_url:mainSha ? `${REPOSITORY_URL}/commit/${mainSha}` : REPOSITORY_URL,
      message:text(mainBranch?.commit?.commit?.message).split("\n")[0],
    },
    current_handoff:{
      path:currentHandoff.path,
      sha:currentHandoff.sha,
      title:handoffTitle(currentHandoff.content),
      content:currentHandoff.content.slice(0,24000),
      explicit_active_pr:requestedPrNumber,
    },
    active_pr:activePr,
    open_pull_requests:candidates.slice(0,20).map(pullSummary),
    commits,
    changed_files:files,
    workflows:runs,
    main_workflows:mainRuns,
  };
}

function disabledResult(error="GITHUB_LIVE_HANDOFF_DISABLED") {
  return {
    available:false,
    stale:false,
    source:"github-api-live",
    authority:"main-current-handoff",
    generated_at:new Date().toISOString(),
    cache_ttl_seconds:CACHE_TTL_MS / 1000,
    repository:{ name:REPOSITORY,url:REPOSITORY_URL },
    canonical_url:PUBLIC_HANDOFF_URL,
    main:null,
    current_handoff:null,
    active_pr:null,
    open_pull_requests:[],
    commits:[],
    changed_files:[],
    workflows:[],
    main_workflows:[],
    error,
  };
}

export async function getLiveGitHubHandoff({ force=false } = {}) {
  if (process.env.GITHUB_LIVE_HANDOFF_DISABLED === "1" || process.env.GITHUB_ACTIONS === "true") {
    return disabledResult();
  }
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
      return disabledResult(text(error?.message || "GITHUB_API_UNAVAILABLE"));
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}
