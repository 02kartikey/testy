/* ════════════════════════════════════════════════════════════════════
   db.js
   SQLite-backed local database. Replaces Supabase + Cloudinary.

   Why better-sqlite3 (not the async sqlite3): synchronous API is
   actually safer in cluster mode — every transaction either commits
   or rolls back atomically with the OS file lock, no callback
   sequencing bugs. SQLite handles concurrent writes from multiple
   workers via WAL-mode journaling.

   Schema:
     students     — one row per registration (PK: session_id)
     assessments  — one row per completed module per student (FK: session_id)
     reports      — one row per generated AI/fallback report   (FK: session_id)

   This file is required exactly once by server.js. The DB connection
   stays open for the worker's lifetime and is closed on graceful
   shutdown.
════════════════════════════════════════════════════════════════════ */

const path = require('path');

let _db = null;

function _initDb() {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'numind.db');
  _db = new Database(dbPath);

  // WAL journal mode: lets readers run concurrently with one writer,
  // dramatically reducing lock contention. Crucial for cluster mode.
  _db.pragma('journal_mode = WAL');
  // Synchronous=NORMAL is the WAL-recommended setting — durable enough
  // for our use (we'd lose at most the last few writes in a crash) and
  // ~3-5x faster than FULL. For student assessment data this is a
  // sensible trade.
  _db.pragma('synchronous = NORMAL');
  // Foreign keys are off by default in SQLite — turn them on so our
  // FK references actually enforce.
  _db.pragma('foreign_keys = ON');

  // ── Schema ──
  _db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      session_id          TEXT PRIMARY KEY,
      first_name          TEXT,
      last_name           TEXT,
      full_name           TEXT,
      class               TEXT,
      section             TEXT,
      school              TEXT,
      school_state        TEXT,
      school_city         TEXT,
      age                 TEXT,
      gender              TEXT,
      email               TEXT,
      registered_at       TEXT NOT NULL,
      completed_at        TEXT,
      report_generated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT NOT NULL,
      module          TEXT NOT NULL,
      raw_answers     TEXT,
      scores_json     TEXT,
      duration_seconds INTEGER,
      saved_at        TEXT NOT NULL,
      UNIQUE(session_id, module),
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      session_id          TEXT PRIMARY KEY,
      generated_at        TEXT NOT NULL,
      is_fallback         INTEGER NOT NULL DEFAULT 0,
      holistic_summary    TEXT,
      aptitude_profile    TEXT,
      interest_profile    TEXT,
      internal_motivators TEXT,
      personality_profile TEXT,
      wellbeing_guidance  TEXT,
      stream_advice       TEXT,
      career_table_json   TEXT,
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_students_school    ON students(school);
    CREATE INDEX IF NOT EXISTS idx_students_class     ON students(class);
    CREATE INDEX IF NOT EXISTS idx_students_registered ON students(registered_at);
  `);

  console.log('✅  SQLite initialised at', dbPath);
  return _db;
}

/* ── Prepared statements (built lazily so _initDb runs first) ── */
let _stmts = null;
function _prep() {
  if (_stmts) return _stmts;
  const db = _initDb();
  _stmts = {
    upsertStudent: db.prepare(`
      INSERT INTO students (
        session_id, first_name, last_name, full_name, class, section,
        school, school_state, school_city, age, gender, email, registered_at
      ) VALUES (
        @session_id, @first_name, @last_name, @full_name, @class, @section,
        @school, @school_state, @school_city, @age, @gender, @email, @registered_at
      )
      ON CONFLICT(session_id) DO UPDATE SET
        first_name   = excluded.first_name,
        last_name    = excluded.last_name,
        full_name    = excluded.full_name,
        class        = excluded.class,
        section      = excluded.section,
        school       = excluded.school,
        school_state = excluded.school_state,
        school_city  = excluded.school_city,
        age          = excluded.age,
        gender       = excluded.gender,
        email        = excluded.email
    `),
    upsertAssessment: db.prepare(`
      INSERT INTO assessments (
        session_id, module, raw_answers, scores_json, duration_seconds, saved_at
      ) VALUES (
        @session_id, @module, @raw_answers, @scores_json, @duration_seconds, @saved_at
      )
      ON CONFLICT(session_id, module) DO UPDATE SET
        raw_answers      = excluded.raw_answers,
        scores_json      = excluded.scores_json,
        duration_seconds = excluded.duration_seconds,
        saved_at         = excluded.saved_at
    `),
    upsertReport: db.prepare(`
      INSERT INTO reports (
        session_id, generated_at, is_fallback,
        holistic_summary, aptitude_profile, interest_profile,
        internal_motivators, personality_profile, wellbeing_guidance,
        stream_advice, career_table_json
      ) VALUES (
        @session_id, @generated_at, @is_fallback,
        @holistic_summary, @aptitude_profile, @interest_profile,
        @internal_motivators, @personality_profile, @wellbeing_guidance,
        @stream_advice, @career_table_json
      )
      ON CONFLICT(session_id) DO UPDATE SET
        generated_at        = excluded.generated_at,
        is_fallback         = excluded.is_fallback,
        holistic_summary    = excluded.holistic_summary,
        aptitude_profile    = excluded.aptitude_profile,
        interest_profile    = excluded.interest_profile,
        internal_motivators = excluded.internal_motivators,
        personality_profile = excluded.personality_profile,
        wellbeing_guidance  = excluded.wellbeing_guidance,
        stream_advice       = excluded.stream_advice,
        career_table_json   = excluded.career_table_json
    `),
    markReportTimestamp: db.prepare(`
      UPDATE students SET report_generated_at = @ts WHERE session_id = @session_id
    `),
    markCompleted: db.prepare(`
      UPDATE students SET completed_at = @ts WHERE session_id = @session_id
    `),
  };
  return _stmts;
}

/* ── Public API ──────────────────────────────────────────────────── */

function saveRegistration(student, sessionId) {
  const s = _prep();
  s.upsertStudent.run({
    session_id:    sessionId,
    first_name:    student.firstName    || '',
    last_name:     student.lastName     || '',
    full_name:     student.fullName     || ((student.firstName || '') + ' ' + (student.lastName || '')).trim(),
    class:         student.class        || '',
    section:       student.section      || '',
    school:        student.school       || '',
    school_state:  student.schoolState  || '',
    school_city:   student.schoolCity   || '',
    age:           String(student.age || ''),
    gender:        student.gender       || '',
    email:         student.email        || '',
    registered_at: new Date().toISOString(),
  });
}

/**
 * saveReport({ sessionId, student, assessments, report })
 *   - student      : same shape as saveRegistration's student arg
 *                    (used to upsert in case registration save was lost)
 *   - assessments  : { cpi: {raw_answers, scores, duration},
 *                      sea: {...}, nmap: {...},
 *                      daab_va: {...}, daab_pa: {...}, ... }
 *   - report       : the AI/fallback report object with all 8 keys
 *
 * Wraps everything in a single transaction so a partial failure
 * leaves the DB in its previous state.
 */
function saveReport({ sessionId, student, assessments, report }) {
  if (!sessionId) throw new Error('saveReport: sessionId is required');
  const db = _initDb();
  const s = _prep();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    // 1) Upsert student (idempotent — safe even if already exists)
    if (student) {
      s.upsertStudent.run({
        session_id:    sessionId,
        first_name:    student.firstName    || '',
        last_name:     student.lastName     || '',
        full_name:     student.fullName     || '',
        class:         student.class        || '',
        section:       student.section      || '',
        school:        student.school       || '',
        school_state:  student.schoolState  || '',
        school_city:   student.schoolCity   || '',
        age:           String(student.age || ''),
        gender:        student.gender       || '',
        email:         student.email        || '',
        registered_at: now,  // only used if INSERT path; UPDATE leaves existing alone
      });
    }

    // 2) One assessments row per module
    if (assessments && typeof assessments === 'object') {
      for (const [moduleName, payload] of Object.entries(assessments)) {
        if (!payload) continue;
        s.upsertAssessment.run({
          session_id:        sessionId,
          module:            moduleName,
          raw_answers:       JSON.stringify(payload.raw_answers ?? null),
          scores_json:       JSON.stringify(payload.scores      ?? null),
          duration_seconds:  Math.floor(payload.duration || 0),
          saved_at:          now,
        });
      }
    }

    // 3) The report itself
    if (report && typeof report === 'object') {
      s.upsertReport.run({
        session_id:          sessionId,
        generated_at:        now,
        is_fallback:         report._fallback ? 1 : 0,
        holistic_summary:    report.holistic_summary    || '',
        aptitude_profile:    report.aptitude_profile    || '',
        interest_profile:    report.interest_profile    || '',
        internal_motivators: report.internal_motivators || '',
        personality_profile: report.personality_profile || '',
        wellbeing_guidance:  report.wellbeing_guidance  || '',
        stream_advice:       report.stream_advice       || '',
        career_table_json:   JSON.stringify(report.career_table || []),
      });
      s.markReportTimestamp.run({ session_id: sessionId, ts: now });
    }

    // 4) Mark the student as completed
    s.markCompleted.run({ session_id: sessionId, ts: now });
  });

  txn();  // execute the transaction
}

function close() {
  if (_db) {
    try { _db.close(); } catch (_) {}
    _db = null;
    _stmts = null;
  }
}

module.exports = { saveRegistration, saveReport, close, _initDb };
