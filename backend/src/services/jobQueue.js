// A minimal background job queue for slow, non-critical work (currently: AI
// guide generation) so the request that triggered it doesn't have to wait
// for a multi-second AI provider call inline.
//
// LifeLoop runs as a single local process for one person, so a full queue
// system (Redis, Bull, etc.) would be infrastructure this app doesn't need
// — it would mean asking the person running `start.sh` to also install and
// run a separate database service. Instead, jobs live in memory (fast to
// enqueue and poll) and are mirrored to a JSON file so a job's final status
// survives a server restart, in case the app was restarted mid-job.
//
// Jobs run one at a time, in the order they were queued. That's intentional:
// it naturally rate-limits how many concurrent calls hit the AI provider's
// API, which matters more for staying within API limits than raw throughput
// does for a single-user local app.

const { v4: uuidv4 } = require("uuid");
const { readCollection, writeCollection } = require("../db");

const queue = [];
let processing = false;

function persist(job) {
  const jobs = readCollection("jobs");
  const index = jobs.findIndex((j) => j.id === job.id);
  if (index >= 0) jobs[index] = job;
  else jobs.push(job);
  // Keep the persisted job log from growing forever — only keep the most
  // recent 200 jobs.
  writeCollection("jobs", jobs.slice(-200));
}

function getJob(id) {
  return readCollection("jobs").find((j) => j.id === id) || null;
}

// `workerFn` is an async function that does the actual work and returns the
// result. Returns the new job's id immediately; the job runs in the
// background.
function enqueue(type, payload, workerFn) {
  const job = {
    id: uuidv4(),
    type,
    payload,
    status: "queued",
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
  persist(job);
  queue.push({ job, workerFn });
  processNext();
  return job.id;
}

async function processNext() {
  if (processing) return;
  const next = queue.shift();
  if (!next) return;

  processing = true;
  const { job, workerFn } = next;
  job.status = "processing";
  job.startedAt = new Date().toISOString();
  persist(job);

  try {
    job.result = await workerFn(job.payload);
    job.status = "done";
  } catch (err) {
    job.status = "failed";
    job.error = err.message || "Job failed.";
  }
  job.finishedAt = new Date().toISOString();
  persist(job);

  processing = false;
  processNext();
}

// On server start, any job left "queued" or "processing" from a previous
// run (e.g. the server was restarted mid-job) can never complete — mark it
// failed so nothing polls forever for a job that will never finish.
function recoverStaleJobs() {
  const jobs = readCollection("jobs");
  let changed = false;
  for (const job of jobs) {
    if (job.status === "queued" || job.status === "processing") {
      job.status = "failed";
      job.error = "Interrupted by a server restart.";
      job.finishedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) writeCollection("jobs", jobs);
}

module.exports = { enqueue, getJob, recoverStaleJobs };
