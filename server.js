const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const cluster = require('cluster');
const os      = require('os');

try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split('\n').forEach(line => {
      const [key, ...val] = line.split('=');
      if (key && val.length) process.env[key.trim()] = val.join('=').trim();
    });
} catch (_) {}

const PORT           = process.env.PORT           || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '12',    10);
const REQ_TIMEOUT_MS = parseInt(process.env.REQ_TIMEOUT_MS || '90000', 10);

if (!OPENAI_API_KEY) {
  console.error('❌  OPENAI_API_KEY is not set. Add it to your .env file or environment variables.');
  process.exit(1);
}
if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`✅  Primary ${process.pid} — spawning ${numCPUs} worker(s) on :${PORT}`);
  for (let i = 0; i < numCPUs; i++) cluster.fork();

  let _primaryShuttingDown = false;
  cluster.on('exit', (worker, code) => {
    if (_primaryShuttingDown) {
      console.log(`[Primary] Worker ${worker.process.pid} exited during shutdown (code ${code})`);
      // If all workers have exited, exit the primary cleanly.
      if (Object.keys(cluster.workers).length === 0) process.exit(0);
      return;
    }
    console.warn(`⚠️  Worker ${worker.process.pid} exited (code ${code}) — restarting`);
    cluster.fork(); // auto-restart so one crash doesn't kill the app
  });

  // Forward SIGTERM/SIGINT to all workers so they drain gracefully.
  function _shutdownPrimary(signal) {
    if (_primaryShuttingDown) return;
    _primaryShuttingDown = true;
    console.log(`[Primary] ${signal} received — forwarding to workers`);
    for (const id in cluster.workers) {
      try { cluster.workers[id].process.kill(signal); } catch (_) {}
    }
    // Hard cap so the primary can't hang forever waiting on a stuck worker.
    setTimeout(() => {
      console.warn('[Primary] forcing exit after timeout');
      process.exit(1);
    }, 20000).unref();
  }
  process.on('SIGTERM', () => _shutdownPrimary('SIGTERM'));
  process.on('SIGINT',  () => _shutdownPrimary('SIGINT'));
  return;
}

const RATE_WINDOW_MS    = parseInt(process.env.RATE_WINDOW_MS    || '60000', 10);
const RATE_MAX_REQS     = parseInt(process.env.RATE_MAX_REQS     || '5',     10);
const SESSION_ID_MAX_LEN = parseInt(process.env.SESSION_ID_MAX_LEN || '64',   10);
const _rateLimitMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of _rateLimitMap) {
    const fresh = ts.filter(t => now - t < RATE_WINDOW_MS);
    if (fresh.length === 0) _rateLimitMap.delete(key);
    else                    _rateLimitMap.set(key, fresh);
  }
}, 5 * 60 * 1000);

function _rateLimitKey(req) {
  const raw = (req.headers['x-session-id'] || '').trim();

  if (raw && raw.length <= SESSION_ID_MAX_LEN && /^[A-Za-z0-9\-]+$/.test(raw)) {
    return { key: 'sid:' + raw, type: 'session' };
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
           || req.socket.remoteAddress
           || 'unknown';
  return { key: 'ip:' + ip, type: 'ip' };
}

function checkRateLimit(req) {
  const { key, type } = _rateLimitKey(req);
  const now  = Date.now();
  const ts   = (_rateLimitMap.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (ts.length >= RATE_MAX_REQS) {
    const retryAfter = Math.ceil((ts[0] + RATE_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(retryAfter, 1), key, type };
  }
  ts.push(now);
  _rateLimitMap.set(key, ts);
  return { allowed: true, key, type };
}
const openaiAgent = new https.Agent({
  keepAlive:      true,
  maxSockets:     MAX_CONCURRENT, 
  maxFreeSockets: 4,
  timeout:        REQ_TIMEOUT_MS,
});

const crypto = require('crypto');

/* ════════════════════════════════════════════════════════════════════
   Cloudinary backup — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
   CLOUDINARY_API_SECRET in .env. Optionally CLOUDINARY_FOLDER (default
   "numind-maps-reports"). PDFs are uploaded as resource_type:'raw'
   into a single flat folder.
════════════════════════════════════════════════════════════════════ */
let _cloudinary = null;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'numind-maps-reports';

function _initCloudinary() {
  if (_cloudinary) return true;
  try {
    const cloudinary = require('cloudinary').v2;
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
    const api_key    = process.env.CLOUDINARY_API_KEY;
    const api_secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud_name || !api_key || !api_secret) {
      console.error('❌  Cloudinary creds missing — set CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET in .env');
      return false;
    }
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
    _cloudinary = cloudinary;
    console.log('✅  Cloudinary initialised — folder:', CLOUDINARY_FOLDER);
    return true;
  } catch (e) {
    console.error('❌  Cloudinary init failed:', e.message);
    return false;
  }
}

/* ════════════════════════════════════════════════════════════════════
   Registration logging was previously written to a Google Sheet.
   That feature was removed when the Drive/Sheets backend was retired.
   We keep the /api/register-student endpoint responding 200 OK so the
   client's fire-and-forget POST in router.js doesn't log warnings.
════════════════════════════════════════════════════════════════════ */
async function _handleRegisterStudent(req, res) {
  // Drain the body so the connection closes cleanly, then ack.
  // No persistence — Supabase already has the registration via
  // DB.saveRegistration on the client side.
  req.on('data', () => {});
  req.on('end', () => {
    if (res.writableEnded) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, note: 'register-student is a no-op; Supabase holds the record.' }));
  });
}

async function _handleBackupPdf(req, res) {
  // Rate-limit Cloudinary uploads to prevent flooding (uses same window/key as
  // /api/ai-report). Cache hits on the AI endpoint don't charge against this
  // limit, so a normal user who regenerates a report still fits comfortably.
  const rl = checkRateLimit(req);
  if (!rl.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) });
    return res.end(JSON.stringify({
      error: `Too many backup requests. Please wait ${rl.retryAfter} second(s) and try again.`,
    }));
  }

  // Body-size guard. NuMind PDFs are typically 1-5 MB; 15 MB raw +
  // base64 inflation (~33%) lands at roughly 20 MB request body — set
  // the cap a bit above that. Anything larger is almost certainly abuse.
  const MAX_BODY_BYTES = parseInt(process.env.MAX_PDF_BODY_BYTES || String(25 * 1024 * 1024), 10);
  const chunks = [];
  let bodyBytes = 0;
  let aborted = false;
  req.on('data', c => {
    if (aborted) return;
    bodyBytes += c.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      aborted = true;
      if (!res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PDF too large.' }));
      }
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (aborted || res.writableEnded) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }

    const { filename, pdfBase64, sessionId } = body;
    if (!filename || !pdfBase64) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing filename or pdfBase64' }));
    }
    // sessionId is optional — if missing we still upload the PDF, we
    // just can't update the registration sheet for it.
    const trimmedSessionId = sessionId ? String(sessionId).slice(0, 64) : '';

    // Sanitise filename — strip path separators, control chars, any
    // characters that aren't safe in a public_id. Force .pdf extension.
    // Cap length so a malicious 10 KB filename can't break logging or
    // downstream tools.
    let safeName = String(filename)
      .replace(/[\\/\x00-\x1f]/g, '_')   // path separators + control chars
      .replace(/[<>:"|?*]/g, '_')         // chars file systems dislike
      .trim()
      .slice(0, 200);
    if (!safeName) safeName = 'backup.pdf';
    if (!/\.pdf$/i.test(safeName)) safeName += '.pdf';

    // Validate base64 payload before sending it to Cloudinary. Rejects
    // garbage up-front rather than letting Cloudinary return a confusing
    // error.
    if (typeof pdfBase64 !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(pdfBase64)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'pdfBase64 is not valid base64.' }));
    }

    if (!_initCloudinary()) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Cloudinary not initialised — check CLOUDINARY_* env vars' }));
    }

    try {
      const buffer = Buffer.from(pdfBase64, 'base64');
      // Sanity: actual decoded PDF must be at least 4 bytes ("%PDF") and
      // not exceed our raw-PDF ceiling. Cloudinary's free-tier per-file
      // limit on raw uploads is 10 MB; paid plans raise it. Keep our
      // server-side cap a touch above the typical PDF size.
      const MAX_PDF_DECODED = parseInt(process.env.MAX_PDF_DECODED_BYTES || String(15 * 1024 * 1024), 10);
      if (buffer.length < 4 || buffer.length > MAX_PDF_DECODED) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'PDF size out of bounds.' }));
      }
      // Light magic-byte check — real PDFs start with "%PDF".
      if (buffer.slice(0, 4).toString('ascii') !== '%PDF') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Payload does not look like a PDF.' }));
      }

      // Cloudinary public_id is the filename minus the .pdf extension —
      // Cloudinary appends format on the URL, not on the public_id.
      // overwrite:true means re-uploads under the same name replace
      // (not duplicate) the existing asset.
      const publicId = safeName.replace(/\.pdf$/i, '');

      const upload = await new Promise((resolve, reject) => {
        const stream = _cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder:        CLOUDINARY_FOLDER,
            public_id:     publicId,
            overwrite:     true,
            // Tag with sessionId (if present) so reports can be cross-
            // referenced with the Supabase row later via the Cloudinary
            // Admin API or dashboard search.
            context:       trimmedSessionId ? { session_id: trimmedSessionId } : undefined,
          },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(buffer);
      });

      console.log(`[Cloudinary backup] ✅  ${upload.public_id} | url=${upload.secure_url}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success:   true,
        publicId:  upload.public_id,
        url:       upload.secure_url,
        bytes:     upload.bytes,
      }));
    } catch (err) {
      console.error('[Cloudinary backup] ❌ upload error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

const CACHE_TTL_MS     = parseInt(process.env.CACHE_TTL_MS     || String(24 * 60 * 60 * 1000), 10);
const CACHE_MAX_ENTRIES = parseInt(process.env.CACHE_MAX_ENTRIES || '500', 10);
const _reportCache = new Map();

function _cacheKey(rawPayload) {
  try {
    const parsed = JSON.parse(rawPayload.toString());
    const msgs   = parsed.messages || [];
    const scored = msgs.map(m => {
      if (m.role !== 'user' || typeof m.content !== 'string') return m;
      const normalised = m.content.replace(/STUDENT:.*?\n/, 'STUDENT: [REDACTED]\n');
      return { role: m.role, content: normalised };
    });
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ model: parsed.model, msgs: scored }))
      .digest('hex');
  } catch (_) {
    return null; // unparseable payload → skip cache
  }
}

function _extractNamesFromPayload(rawPayload) {
  try {
    const parsed = JSON.parse(rawPayload.toString());
    const msgs   = parsed.messages || [];
    for (const m of msgs) {
      if (m.role !== 'user' || typeof m.content !== 'string') continue;
      const studentMatch = m.content.match(/^STUDENT:\s*(.+?),\s*Class\s/m);
      if (!studentMatch) continue;
      const fullName  = studentMatch[1].trim();
      const firstMatch = m.content.match(/Use\s+(\S+?)'s name naturally throughout/);
      const firstName  = firstMatch ? firstMatch[1].trim() : fullName.split(' ')[0];

      return { firstName, fullName };
    }
    return null;
  } catch (_) {
    return null;
  }
}

function _anonymiseBody(jsonText, firstName, fullName) {
  if (!firstName && !fullName) return jsonText;
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  let out = jsonText;
  if (fullName)  out = out.replace(new RegExp('\\b' + escRe(fullName)  + '\\b', 'g'), '__FULL_NAME__');
  if (firstName) out = out.replace(new RegExp('\\b' + escRe(firstName) + '\\b', 'g'), '__FIRST_NAME__');
  return out;
}

function _cacheGet(key) {
  if (!key) return null;
  const entry = _reportCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _reportCache.delete(key); return null; }
  return entry.body;
}

function _cacheSet(key, body) {
  if (!key) return;
  // LRU eviction: delete oldest entry when at capacity.
  if (_reportCache.size >= CACHE_MAX_ENTRIES) {
    _reportCache.delete(_reportCache.keys().next().value);
  }
  _reportCache.set(key, { body, ts: Date.now() });
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _reportCache) {
    if (now - v.ts > CACHE_TTL_MS) _reportCache.delete(k);
  }
}, 60 * 60 * 1000);

let activeRequests = 0;
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || '50', 10);
const requestQueue = [];
function drainQueue() {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = requestQueue.shift();
    if (!next) break;
    if (next.cancelled) continue;
    activeRequests++; // claim slot
    try {
      next.run(); // must not increment activeRequests again
    } catch (err) {
      console.error('[Queue] run() failed:', err.message);
      activeRequests--; // release slot on failure
    }
  }
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    setImmediate(drainQueue);
  }
}

const MAX_ACTIVE      = parseInt(process.env.MAX_ACTIVE || String(MAX_CONCURRENT), 10);
const MAX_JOB_RETRIES = 2;
let   activeJobs = 0;
const jobQueue   = [];  
const MAX_JOB_QUEUE = parseInt(process.env.MAX_JOB_QUEUE || '100', 10); // entries: { job: Buffer, resolve: Function, reject: Function }

function callOpenAI(payload) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path:     '/v1/chat/completions',
      method:   'POST',
      agent:    openaiAgent,
      timeout:  REQ_TIMEOUT_MS,
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': payload.length,
        'Connection':     'keep-alive',
      },
    };

    const proxyReq = https.request(options, proxyRes => resolve({ proxyRes, payload }));
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      reject(new Error('OpenAI request timed out'));
    });
    proxyReq.on('error', err => reject(err));
    proxyReq.write(payload);
    proxyReq.end();
  });
}

async function processJob(payload, retries = MAX_JOB_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await callOpenAI(payload);
      return result;
    } catch (err) {
      const isLast = attempt === retries;
      console.warn(`[JobQueue] Attempt ${attempt + 1}/${retries + 1} failed: ${err.message}${isLast ? ' — giving up' : ' — retrying'}`);
      if (isLast) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

function processQueue() {
  while (jobQueue.length > 0 && activeJobs < MAX_ACTIVE) {
    const item = jobQueue.shift();
    if (!item) break; // safety guard
    const { job, resolve, reject } = item;
    activeJobs++;
    if (activeJobs % 5 === 0) {
      console.log(`[JobQueue] active=${activeJobs}/${MAX_ACTIVE} queued=${jobQueue.length}`);
    }
    processJob(job)
      .then(result => {
        resolve(result);
      })
      .catch(err => {
        console.error(`[JobQueue] Job failed after retries: ${err.message}`);
        reject(err);
      })
      .finally(() => {
        activeJobs--; // release slot
        console.log(
          `[JobQueue] Done — active=${activeJobs}/${MAX_ACTIVE} queued=${jobQueue.length}`
        );
        processQueue(); // immediately process next job
      });
  }
}
function addJob(payload) {
  return new Promise((resolve, reject) => {

    if (jobQueue.length >= MAX_JOB_QUEUE) {
      console.warn(`[JobQueue] FULL (${jobQueue.length}/${MAX_JOB_QUEUE}) — rejecting job`);
      reject(new Error('Job queue full'));
      return;
    }
    console.log(`[JobQueue] Job added — active=${activeJobs}/${MAX_ACTIVE} queued=${jobQueue.length + 1}`);
    jobQueue.push({ job: payload, resolve, reject });
    processQueue();
  });
}
const _fileCache = new Map();
function serveStatic(filePath, res, req) {
  const isHtml = path.extname(filePath) === '.html';
  if (_fileCache.has(filePath)) {
    const { data, ct, etag } = _fileCache.get(filePath);
    // Handle conditional GET — return 304 if client already has this version.
    if (req && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'public, max-age=3600' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': ct, 'ETag': etag, 'Cache-Control': 'public, max-age=3600' });
    res.end(data);
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(path.basename(filePath) + ' not found'); return; }
    const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};
    const ct   = MIME[path.extname(filePath)] || 'text/plain';
    const etag = '"' + data.length + '-' + require('crypto').createHash('md5').update(data).digest('hex').slice(0, 8) + '"';
    if (!isHtml) _fileCache.set(filePath, { data, ct, etag });
    const cacheControl = isHtml ? 'no-cache' : 'public, max-age=3600';
    if (!isHtml && req && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': cacheControl });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': ct, 'ETag': etag, 'Cache-Control': cacheControl });
    res.end(data);
  });
}

function runProxyRequest(payload, req, res, slotAlreadyClaimed) {
  if (res.writableEnded || !req.socket?.readable) {
    if (slotAlreadyClaimed) activeRequests--;
    drainQueue();
    return;
  }

  const cacheKey = _cacheKey(payload);
  let   isStream = false;
  try { isStream = !!JSON.parse(payload.toString()).stream; } catch (_) {}

  if (cacheKey) {
    const cached = _cacheGet(cacheKey);
    if (cached) {
      console.log(`[Cache] HIT  key=${cacheKey.slice(0, 12)}... size=${_reportCache.size} stream=${isStream}`);
      res.writeHead(200, {
        'Content-Type':   'application/json',
        'Cache-Control':  'no-cache',
        'X-Cache':        'HIT',
        'Content-Length': String(cached.length),
      });
      res.end(cached);
      if (slotAlreadyClaimed) activeRequests--;
      drainQueue();
      return;
    }
    console.log(`[Cache] MISS key=${cacheKey.slice(0, 12)}... size=${_reportCache.size}`);
  }

  if (!slotAlreadyClaimed) activeRequests++;
  const releaseSlot = (() => {
    let released = false;
    return () => { if (!released) { released = true; activeRequests--; drainQueue(); } };
  })();
  res.on('finish', releaseSlot);
  res.on('close',  releaseSlot);

  addJob(payload)
    .then(({ proxyRes }) => {
      if (res.writableEnded) return;
      handleProxyResponse(proxyRes, res, req, payload, cacheKey, isStream);
    })
    .catch(err => {
      if (res.writableEnded) return;
      if (err.message === 'Job queue full' || err.message === 'Server busy') {
        if (!res.headersSent) res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: { message: 'Server busy. Please retry shortly.' },
        }));
      }
      console.error('[Proxy Error]', err.message);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Failed to reach OpenAI: ' + err.message } }));
    });
} 
function handleProxyResponse(proxyRes, res, req, payload, cacheKey, isStream) {
  const status = proxyRes.statusCode;
  proxyRes.setTimeout(REQ_TIMEOUT_MS, () => {
    console.warn('[Proxy] proxyRes stalled — destroying socket');
    proxyRes.destroy();
    if (!res.writableEnded) res.end();
  });

  const forwardHeaders = {
    'Content-Type':      isStream ? 'text/event-stream' : 'application/json',
    'Cache-Control':     'no-cache',
    'X-Accel-Buffering': 'no',
    'Connection':        'keep-alive',
    'X-Cache':           'MISS',
  };
  [
    'retry-after',
    'x-ratelimit-limit-requests',  'x-ratelimit-remaining-requests',
    'x-ratelimit-limit-tokens',    'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-requests',  'x-ratelimit-reset-tokens',
  ].forEach(k => { if (proxyRes.headers[k]) forwardHeaders[k] = proxyRes.headers[k]; });

  res.writeHead(status, forwardHeaders);

  if (isStream) {
    const sseChunks = [];
    proxyRes.on('data', chunk => {
      if (!res.writableEnded) res.write(chunk);
      sseChunks.push(chunk);
    });
    proxyRes.on('end', () => {
      if (!res.writableEnded) res.end();
      if (status === 200 && cacheKey) {
        try {
          const raw = Buffer.concat(sseChunks).toString('utf8');
          let accumulated = '';
          for (const line of raw.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const sseData = line.slice(6).trim();
            if (sseData === '[DONE]') break;
            try {
              const parsed = JSON.parse(sseData);
              accumulated += parsed?.choices?.[0]?.delta?.content || '';
            } catch (_) {}
          }
          if (accumulated) {
            const names       = _extractNamesFromPayload(payload);
            const anonText    = _anonymiseBody(accumulated, names && names.firstName, names && names.fullName);
            const syntheticBody = JSON.stringify({
              choices: [{ message: { content: anonText } }],
              _cached: true,
            });
            _cacheSet(cacheKey, Buffer.from(syntheticBody));
            console.log(`[Cache] SET  key=${cacheKey.slice(0, 12)}… (from stream, anonymised: fn=${names && names.firstName})`);
          }
        } catch (_) { /* best-effort — never crash the response */ }
      }
    });
    proxyRes.on('error', err => {
      console.error('[Stream Error]', err.message);
      if (!res.writableEnded) res.end();
    });
    req.on('close', () => { if (!proxyRes.destroyed) proxyRes.destroy(); });
  } else {
    const parts = [];
    proxyRes.on('data', c => parts.push(c));
    proxyRes.on('end', () => {
      const body = Buffer.concat(parts);
      if (status === 200 && cacheKey) {
        const names       = _extractNamesFromPayload(payload);
        const anonText    = _anonymiseBody(body.toString('utf8'), names && names.firstName, names && names.fullName);
        _cacheSet(cacheKey, Buffer.from(anonText, 'utf8'));
        console.log(`[Cache] SET  key=${cacheKey.slice(0, 12)}… (anonymised: fn=${names && names.firstName})`);
      }
      if (!res.writableEnded) res.end(body);
    });
  }
}
const server = http.createServer((req, res) => {

  req.setTimeout(REQ_TIMEOUT_MS, () => {
    if (!res.headersSent) res.writeHead(504, { 'Content-Type': 'application/json' });
    if (!res.writableEnded) res.end(JSON.stringify({ error: { message: 'Request timed out.' } }));
  });
  if (req.method === 'POST' && req.url === '/api/backup-pdf') {
    return _handleBackupPdf(req, res);
  }

  if (req.method === 'POST' && req.url === '/api/register-student') {
    return _handleRegisterStudent(req, res);
  }

  if (req.method === 'POST' && req.url === '/api/ai-report') {

    // Body-size guard: protects against memory-exhaustion attacks where a
    // client streams gigabytes. The legit prompts are well under 100 KB.
    const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || String(512 * 1024), 10);
    const chunks = [];
    let bodyBytes = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_BODY_BYTES) {
        aborted = true;
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Request body too large.' } }));
        }
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted || res.writableEnded) return;
      const payload = Buffer.concat(chunks);

      // ── Cache-first short-circuit ──────────────────────────────
      // Cache hits cost nothing — don't charge them against the rate
      // limit. This matters for kiosk/lab networks where many students
      // share an IP and may regenerate identical reports.
      let cacheKey = null;
      try { cacheKey = _cacheKey(payload); } catch (_) {}
      if (cacheKey) {
        const cached = _cacheGet(cacheKey);
        if (cached) {
          console.log(`[Cache] HIT (pre-RL) key=${cacheKey.slice(0, 12)}... size=${_reportCache.size}`);
          res.writeHead(200, {
            'Content-Type':   'application/json',
            'Cache-Control':  'no-cache',
            'X-Cache':        'HIT',
            'Content-Length': String(cached.length),
          });
          return res.end(cached);
        }
      }

      // ── Rate limit (only on cache miss) ────────────────────────
      const rl = checkRateLimit(req);
      if (!rl.allowed) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After':  String(rl.retryAfter),
        });
        res.end(JSON.stringify({
          error: {
            message: `Too many report requests. Please wait ${rl.retryAfter} second(s) and try again.`,
            retryAfter: rl.retryAfter,
          },
        }));
        console.warn(`[RateLimit] ${rl.type}=${rl.key} blocked — ${RATE_MAX_REQS} req/${RATE_WINDOW_MS}ms window. Retry in ${rl.retryAfter}s`);
        return;
      }

      // ── Concurrency / queue ────────────────────────────────────
      if (activeRequests < MAX_CONCURRENT) {
        activeRequests++;                          // claim slot before runProxyRequest
        runProxyRequest(payload, req, res, true); // slotAlreadyClaimed=true
      } else if (requestQueue.length < MAX_QUEUE_SIZE) {
        const entry = { cancelled: false, run: null };
        entry.run = () => runProxyRequest(payload, req, res, true); // slot pre-claimed by drainQueue
        req.on('close', () => {
          if (entry.cancelled || res.writableEnded) return;
          entry.cancelled = true;
          console.log(`[Queue] Client disconnected while queued — slot freed (worker ${process.pid})`);
        });
        requestQueue.push(entry);
        console.log(`[Queue] ${requestQueue.length} request(s) waiting (worker ${process.pid})`);
      } else {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After':  '30',
          'X-Queue-Depth': String(requestQueue.length),
        });
        res.end(JSON.stringify({
          error: { message: 'Server is busy. Queue is full — please wait a moment and try again.' },
          queueDepth: requestQueue.length,
          maxQueue:   MAX_QUEUE_SIZE,
        }));
        console.warn(`[Queue] FULL (${requestQueue.length}/${MAX_QUEUE_SIZE}) — hard-rejected (worker ${process.pid})`);
      }
    });
    return;
  }
  if (req.method === 'GET') {
  const urlPath = req.url.split('?')[0];
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  const ext = path.extname(cleanPath);

  const allowed = ['.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const candidate = allowed.includes(ext)
    ? path.join(__dirname, cleanPath)
    : path.join(__dirname, 'index.html');

  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(path.resolve(__dirname) + path.sep) &&
      resolved !== path.resolve(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveStatic(resolved, res, req);
  return;
}
  res.writeHead(405);
  res.end('Method Not Allowed');
});
server.listen(PORT, () => {
  console.log(`✅  Worker ${process.pid} listening on :${PORT}`);
});

/* ── Graceful shutdown ────────────────────────────────────────────────
   On SIGTERM/SIGINT (rolling deploys, container stop, Ctrl-C) we stop
   accepting new connections and give in-flight requests up to
   GRACEFUL_TIMEOUT_MS to finish. After that we forcibly exit so the
   process manager can replace us. The cluster primary auto-spawns a
   replacement worker in the meantime.
─────────────────────────────────────────────────────────────────────*/
let _shuttingDown = false;
function _gracefulShutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  const GRACEFUL_TIMEOUT_MS = parseInt(process.env.GRACEFUL_TIMEOUT_MS || '15000', 10);
  console.log(`[Worker ${process.pid}] ${signal} received — draining (timeout ${GRACEFUL_TIMEOUT_MS}ms)`);

  // Stop accepting new connections; existing ones finish naturally.
  server.close(err => {
    if (err) console.error(`[Worker ${process.pid}] server.close error:`, err.message);
    console.log(`[Worker ${process.pid}] drained — exiting cleanly`);
    process.exit(0);
  });

  // Hard cap — if a slow OpenAI stream is still going at this point, bail.
  setTimeout(() => {
    console.warn(`[Worker ${process.pid}] graceful timeout — forcing exit (active=${activeRequests}, queued=${requestQueue.length})`);
    process.exit(1);
  }, GRACEFUL_TIMEOUT_MS).unref();
}
process.on('SIGTERM', () => _gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => _gracefulShutdown('SIGINT'));

// Last-ditch crash net — log and let the cluster primary respawn us.
// Without this, an unhandled rejection silently terminates the worker
// in newer Node versions.
process.on('unhandledRejection', err => {
  console.error(`[Worker ${process.pid}] unhandledRejection:`, err && err.stack || err);
});
process.on('uncaughtException', err => {
  console.error(`[Worker ${process.pid}] uncaughtException:`, err && err.stack || err);
  // Try to drain, then exit — primary will respawn.
  _gracefulShutdown('uncaughtException');
});
