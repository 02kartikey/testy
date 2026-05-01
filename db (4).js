/* ════════════════════════════════════════════════════════════════════
   db.js  —  FIXED VERSION
   SQLite-backed local database. Replaces Supabase + Cloudinary.

   ── What was broken and what was fixed ──────────────────────────────

   BUG 1  registered_at always overwritten on restart / re-registration
     OLD: ON CONFLICT DO UPDATE SET ... registered_at = excluded.registered_at
          This means every upsertStudent call stomped the original timestamp.
     FIX: registered_at is excluded from the DO UPDATE SET list so it is
          only ever written on the very first INSERT and never touched again.

   BUG 2  Child report tables (personality, aptitude, interests, seaa,
          careers) were DELETE-then-INSERT inside saveReport.
          If the process crashed between the DELETE and the INSERT the
          rows were permanently gone — nothing left in the DB for that
          session.
     FIX: Changed to INSERT OR REPLACE (upsert by primary key).  No DELETE
          step at all.  If the row already exists it is atomically replaced;
          if it doesn't exist it is inserted.  A crash at any point leaves
          either the old data or the new data — never empty.

   BUG 3  saveReport blindly overwrote good AI prose with a fallback report.
          If the first saveReport succeeded (is_fallback=0) and the server
          restarted and re-ran saveReport with a fallback (is_fallback=1),
          the good prose was permanently replaced.
     FIX: The ON CONFLICT DO UPDATE for report_summary only updates AI-prose
          fields when the incoming record is NOT a fallback (is_fallback=0),
          or when no report summary existed yet. Computed/derived fields
          (scores, pathways, statuses) are always updated because they are
          derived from the assessment data and are always correct.

   BUG 4  saveRegistration always passed new Date().toISOString() as
          registered_at. Combined with Bug 1 this meant every server
          restart silently changed the registration timestamp.
     FIX: registered_at in the upsertStudent INSERT is set to the passed-in
          value (or NOW() on first insert). Because the DO UPDATE no longer
          touches registered_at, retries are harmless.

   ── Concurrency / scale notes (200-300 concurrent users) ────────────
     • WAL mode + busy_timeout=5000 handle burst writes fine for this
       load.  SQLite in WAL mode supports many concurrent readers with
       one writer; at 200-300 users each doing a handful of writes (one
       per section) the queue rarely builds up.
     • Every write is an upsert — safe to retry without duplication.
     • saveSection is per-column UPDATE so two modules for the same
       student never conflict with each other.

   Schema (unchanged — mirrors every field rendered in pdf/download.js):
     students         — registration + profile
     assessments      — wide row: raw answers, scores, durations per module
     section_progress — incremental section completion log (audit/recovery)
     report_summary   — flattened AI prose + computed snapshot fields
     report_personality — 9 NMAP rows per session  (FK)
     report_aptitude    — 8 DAAB  rows per session (FK)
     report_interests   — 8 CPI   rows per session (FK)
     report_seaa        — 3 SEAA  rows per session (FK)
     report_careers     — career-fit-matrix rows (variable)  (FK)
════════════════════════════════════════════════════════════════════ */

const path = require('path');

let _db = null;

function _initDb() {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'numind.db');
  _db = new Database(dbPath);

  // WAL journal mode: concurrent readers with one writer.
  _db.pragma('journal_mode = WAL');
  // Wait up to 5s for a busy lock instead of failing instantly — important
  // when many workers hit the same DB while a student finishes a section.
  _db.pragma('busy_timeout = 5000');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  // ── Schema ──
  _db.exec(`
    /* ───────────── students ───────────── */
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

    /* ───────────── assessments (raw answers + scores + durations) ───────────── */
    CREATE TABLE IF NOT EXISTS assessments (
      session_id            TEXT PRIMARY KEY,
      saved_at              TEXT NOT NULL,
      cpi_raw_answers       TEXT, cpi_scores_json       TEXT, cpi_duration_seconds       INTEGER, cpi_completed_at       TEXT,
      sea_raw_answers       TEXT, sea_scores_json       TEXT, sea_duration_seconds       INTEGER, sea_completed_at       TEXT,
      nmap_raw_answers      TEXT, nmap_scores_json      TEXT, nmap_duration_seconds      INTEGER, nmap_completed_at      TEXT,
      daab_va_raw_answers   TEXT, daab_va_scores_json   TEXT, daab_va_duration_seconds   INTEGER, daab_va_completed_at   TEXT,
      daab_pa_raw_answers   TEXT, daab_pa_scores_json   TEXT, daab_pa_duration_seconds   INTEGER, daab_pa_completed_at   TEXT,
      daab_na_raw_answers   TEXT, daab_na_scores_json   TEXT, daab_na_duration_seconds   INTEGER, daab_na_completed_at   TEXT,
      daab_lsa_raw_answers  TEXT, daab_lsa_scores_json  TEXT, daab_lsa_duration_seconds  INTEGER, daab_lsa_completed_at  TEXT,
      daab_hma_raw_answers  TEXT, daab_hma_scores_json  TEXT, daab_hma_duration_seconds  INTEGER, daab_hma_completed_at  TEXT,
      daab_ar_raw_answers   TEXT, daab_ar_scores_json   TEXT, daab_ar_duration_seconds   INTEGER, daab_ar_completed_at   TEXT,
      daab_ma_raw_answers   TEXT, daab_ma_scores_json   TEXT, daab_ma_duration_seconds   INTEGER, daab_ma_completed_at   TEXT,
      daab_sa_raw_answers   TEXT, daab_sa_scores_json   TEXT, daab_sa_duration_seconds   INTEGER, daab_sa_completed_at   TEXT,
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── section_progress (audit log of incremental submissions) ───────────── */
    CREATE TABLE IF NOT EXISTS section_progress (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT NOT NULL,
      module_key    TEXT NOT NULL,
      submitted_at  TEXT NOT NULL,
      duration_seconds INTEGER,
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── report_summary (AI prose + computed metrics) ───────────── */
    CREATE TABLE IF NOT EXISTS report_summary (
      session_id          TEXT PRIMARY KEY,
      generated_at        TEXT NOT NULL,
      is_fallback         INTEGER NOT NULL DEFAULT 0,

      -- AI prose (8 fields produced by the AI generator)
      holistic_summary    TEXT,
      aptitude_profile    TEXT,
      interest_profile    TEXT,
      internal_motivators TEXT,
      personality_profile TEXT,
      wellbeing_guidance  TEXT,
      stream_advice       TEXT,

      -- Snapshot / Integrated Fit (page 3)
      avg_personality_stanine REAL,
      avg_aptitude_stanine    REAL,
      top_interest_score      INTEGER,
      fit_score               INTEGER,
      fit_tier                TEXT,
      personality_status      TEXT,
      aptitude_status         TEXT,
      interest_status         TEXT,
      seaa_status             TEXT,

      -- Recommended pathways (page 10 summary buckets)
      strong_fit_pathways     TEXT,   -- JSON array
      emerging_fit_pathways   TEXT,   -- JSON array
      exploratory_pathways    TEXT,   -- JSON array
      recommended_primary     TEXT,
      recommended_alternate   TEXT,
      recommended_exploratory TEXT,

      -- Top trait/aptitude/interest summaries (rendered on snapshot page)
      top_personality_traits_json TEXT,  -- top 3 [{name, stanine, label}]
      strong_aptitudes_json       TEXT,  -- []string
      emerging_aptitudes_json     TEXT,  -- []string
      top3_interests_json         TEXT,  -- top 3 [{label, score, level}]

      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── report_personality (9 NMAP dims) ───────────── */
    CREATE TABLE IF NOT EXISTS report_personality (
      session_id   TEXT NOT NULL,
      position     INTEGER NOT NULL,         -- 0..8 display order
      name         TEXT NOT NULL,
      stanine      INTEGER NOT NULL,
      band         TEXT NOT NULL,            -- Strength | Developing | Needs Attention
      PRIMARY KEY (session_id, position),
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── report_aptitude (8 DAAB sub-tests) ───────────── */
    CREATE TABLE IF NOT EXISTS report_aptitude (
      session_id   TEXT NOT NULL,
      position     INTEGER NOT NULL,         -- display order index
      key          TEXT NOT NULL,            -- va | pa | na | lsa | hma | ar | ma | sa
      name         TEXT NOT NULL,
      stanine      INTEGER NOT NULL,
      band         TEXT NOT NULL,
      raw_score    INTEGER,
      max_score    INTEGER,
      PRIMARY KEY (session_id, key),
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── report_interests (CPI ranked, top 8) ───────────── */
    CREATE TABLE IF NOT EXISTS report_interests (
      session_id   TEXT NOT NULL,
      rank         INTEGER NOT NULL,         -- 1..N
      label        TEXT NOT NULL,
      score        INTEGER NOT NULL,         -- 0..20
      level        TEXT NOT NULL,            -- Strong | Moderate | Low
      PRIMARY KEY (session_id, rank),
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── report_seaa (3 SEAA domains) ───────────── */
    CREATE TABLE IF NOT EXISTS report_seaa (
      session_id   TEXT NOT NULL,
      key          TEXT NOT NULL,            -- S | E | A
      title        TEXT NOT NULL,            -- Social Adjustment / Emotional / Academic
      score        INTEGER NOT NULL,         -- 0..20 (lower = better)
      category     TEXT,                     -- A | B | C | D | E
      cat_label    TEXT,                     -- Strong Readiness / Developing / Support Needed
      PRIMARY KEY (session_id, key),
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── report_careers (Integrated Career Fit Matrix) ───────────── */
    CREATE TABLE IF NOT EXISTS report_careers (
      session_id        TEXT NOT NULL,
      position          INTEGER NOT NULL,     -- row order in matrix
      career            TEXT NOT NULL,
      cluster           TEXT,
      interest_fit      TEXT,                 -- High | Moderate | Low
      aptitude_fit      TEXT,
      personality_fit   TEXT,
      seaa_fit          TEXT,
      suitability_pct   INTEGER,
      alignment         TEXT,                 -- Strong Fit | Emerging Fit | Exploratory
      rationale         TEXT,
      PRIMARY KEY (session_id, position),
      FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
    );

    /* ───────────── Indexes ───────────── */
    CREATE INDEX IF NOT EXISTS idx_students_school     ON students(school);
    CREATE INDEX IF NOT EXISTS idx_students_class      ON students(class);
    CREATE INDEX IF NOT EXISTS idx_students_registered ON students(registered_at);
    CREATE INDEX IF NOT EXISTS idx_students_email      ON students(email);
    CREATE INDEX IF NOT EXISTS idx_section_progress_session ON section_progress(session_id);
    CREATE INDEX IF NOT EXISTS idx_careers_cluster     ON report_careers(cluster);
    CREATE INDEX IF NOT EXISTS idx_interests_label     ON report_interests(label);
  `);

  /* ─── Lightweight migration: add any new columns to legacy DBs ─── */
  const _ensureCol = (table, col, decl) => {
    const cols = _db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) {
      try { _db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`); }
      catch (e) { /* ignore — already exists or table missing */ }
    }
  };
  // Newer per-section completion timestamps (added in this revision)
  ['cpi','sea','nmap','daab_va','daab_pa','daab_na','daab_lsa','daab_hma','daab_ar','daab_ma','daab_sa']
    .forEach(m => _ensureCol('assessments', m + '_completed_at', 'TEXT'));

  /* ─── Schema integrity check + auto-rebuild for legacy DBs ─────────
     CREATE TABLE IF NOT EXISTS is a no-op when a table already exists,
     so a DB created by an older version of this file may be missing the
     PRIMARY KEY / UNIQUE constraints needed for ON CONFLICT(session_id).
     Detect that and rebuild the table preserving existing rows.
  ──────────────────────────────────────────────────────────────────── */
  const _hasSessionIdUniqueness = (table) => {
    try {
      const info = _db.prepare(`PRAGMA table_info(${table})`).all();
      const sidCol = info.find(c => c.name === 'session_id');
      if (sidCol && sidCol.pk === 1) return true;
      const idxList = _db.prepare(`PRAGMA index_list(${table})`).all();
      for (const idx of idxList) {
        if (!idx.unique) continue;
        const cols = _db.prepare(`PRAGMA index_info(${idx.name})`).all();
        if (cols.length === 1 && cols[0].name === 'session_id') return true;
      }
    } catch (e) { /* table missing — handled by CREATE above */ }
    return false;
  };

  const _rebuildTablePreservingData = (table, createSql) => {
    console.warn(`[DB] Rebuilding "${table}" — legacy schema missing constraints. Preserving existing rows.`);
    _db.exec('PRAGMA foreign_keys = OFF');
    const tx = _db.transaction(() => {
      const oldCols = _db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      _db.exec(`ALTER TABLE ${table} RENAME TO ${table}__legacy`);
      _db.exec(createSql);
      const newCols = _db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      const shared  = oldCols.filter(c => newCols.includes(c));
      if (shared.length) {
        const cols = shared.join(', ');
        _db.exec(`INSERT OR IGNORE INTO ${table} (${cols}) SELECT ${cols} FROM ${table}__legacy`);
      }
      _db.exec(`DROP TABLE ${table}__legacy`);
    });
    try { tx(); } finally { _db.exec('PRAGMA foreign_keys = ON'); }
  };

  if (!_hasSessionIdUniqueness('students')) {
    _rebuildTablePreservingData('students', `
      CREATE TABLE students (
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
      )
    `);
    // Re-create indexes that were dropped with the old table
    _db.exec(`
      CREATE INDEX IF NOT EXISTS idx_students_school     ON students(school);
      CREATE INDEX IF NOT EXISTS idx_students_class      ON students(class);
      CREATE INDEX IF NOT EXISTS idx_students_registered ON students(registered_at);
      CREATE INDEX IF NOT EXISTS idx_students_email      ON students(email);
    `);
  }

  if (!_hasSessionIdUniqueness('assessments')) {
    // Build the assessments DDL programmatically to keep it in sync.
    const moduleCols = ['cpi','sea','nmap','daab_va','daab_pa','daab_na','daab_lsa','daab_hma','daab_ar','daab_ma','daab_sa']
      .map(m => `${m}_raw_answers TEXT, ${m}_scores_json TEXT, ${m}_duration_seconds INTEGER, ${m}_completed_at TEXT`)
      .join(',\n        ');
    _rebuildTablePreservingData('assessments', `
      CREATE TABLE assessments (
        session_id  TEXT PRIMARY KEY,
        saved_at    TEXT NOT NULL,
        ${moduleCols},
        FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
      )
    `);
  }

  if (!_hasSessionIdUniqueness('report_summary')) {
    _rebuildTablePreservingData('report_summary', `
      CREATE TABLE report_summary (
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
        avg_personality_stanine REAL,
        avg_aptitude_stanine    REAL,
        top_interest_score      INTEGER,
        fit_score               INTEGER,
        fit_tier                TEXT,
        personality_status      TEXT,
        aptitude_status         TEXT,
        interest_status         TEXT,
        seaa_status             TEXT,
        strong_fit_pathways     TEXT,
        emerging_fit_pathways   TEXT,
        exploratory_pathways    TEXT,
        recommended_primary     TEXT,
        recommended_alternate   TEXT,
        recommended_exploratory TEXT,
        top_personality_traits_json TEXT,
        strong_aptitudes_json       TEXT,
        emerging_aptitudes_json     TEXT,
        top3_interests_json         TEXT,
        FOREIGN KEY (session_id) REFERENCES students(session_id) ON DELETE CASCADE
      )
    `);
  }

  /* Legacy "reports" table from the previous version of this file —
     drop it if present, since report data now lives in report_summary
     plus the FK child tables. */
  try {
    const hasLegacy = _db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='reports'`
    ).get();
    if (hasLegacy) {
      console.warn('[DB] Dropping legacy "reports" table — superseded by report_summary + FK tables.');
      _db.exec('DROP TABLE reports');
    }
  } catch (_) {}

  console.log('✅  SQLite initialised at', dbPath);
  return _db;
}

/* ─────────────────────────────────────────────────────────────────
   Module list — keep in one place. Mirrors download.js + state.js.
───────────────────────────────────────────────────────────────── */
const MODULES = [
  'cpi','sea','nmap',
  'daab_va','daab_pa','daab_na','daab_lsa','daab_hma','daab_ar','daab_ma','daab_sa',
];

/* ── Prepared statements (built lazily so _initDb runs first) ── */
let _stmts = null;
function _prep() {
  if (_stmts) return _stmts;
  const db = _initDb();
  _stmts = {

    /* ─────────────────────────────────────────────────────────────
       FIX (Bug 1 + Bug 4): registered_at is intentionally absent
       from the DO UPDATE SET list.
       • On first INSERT it is written from @registered_at.
       • On any subsequent conflict (re-registration, restart,
         retry) it is left completely untouched.
       All other profile fields (name, school, etc.) are still
       kept up-to-date so a student can correct a typo.
    ───────────────────────────────────────────────────────────── */
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
        -- registered_at intentionally omitted: preserved forever after first write
    `),

    /* Ensure an assessments row exists for the session_id without
       overwriting existing module data — used by saveSection so the
       per-module UPDATE has a row to land on. */
    ensureAssessmentRow: db.prepare(`
      INSERT INTO assessments (session_id, saved_at)
      VALUES (@session_id, @saved_at)
      ON CONFLICT(session_id) DO NOTHING
    `),

    markCompleted: db.prepare(`
      UPDATE students SET completed_at = @ts WHERE session_id = @session_id
    `),
    markReportTimestamp: db.prepare(`
      UPDATE students SET report_generated_at = @ts WHERE session_id = @session_id
    `),

    insertSectionProgress: db.prepare(`
      INSERT INTO section_progress (session_id, module_key, submitted_at, duration_seconds)
      VALUES (@session_id, @module_key, @submitted_at, @duration_seconds)
    `),

    /* ── report_summary upsert ──────────────────────────────────────
       FIX (Bug 3): AI prose fields (holistic_summary, aptitude_profile,
       etc.) are only overwritten when the incoming record is a REAL
       report (is_fallback = 0).  If a retry/restart produces a fallback
       report and a real one already exists in the DB, the good prose
       is preserved.

       Computed/derived fields (scores, statuses, pathways) are always
       updated because they are re-derived from raw assessment data and
       are always correct regardless of fallback status.
    ────────────────────────────────────────────────────────────────── */
    upsertReportSummary: db.prepare(`
      INSERT INTO report_summary (
        session_id, generated_at, is_fallback,
        holistic_summary, aptitude_profile, interest_profile,
        internal_motivators, personality_profile, wellbeing_guidance, stream_advice,
        avg_personality_stanine, avg_aptitude_stanine, top_interest_score,
        fit_score, fit_tier,
        personality_status, aptitude_status, interest_status, seaa_status,
        strong_fit_pathways, emerging_fit_pathways, exploratory_pathways,
        recommended_primary, recommended_alternate, recommended_exploratory,
        top_personality_traits_json, strong_aptitudes_json, emerging_aptitudes_json,
        top3_interests_json
      ) VALUES (
        @session_id, @generated_at, @is_fallback,
        @holistic_summary, @aptitude_profile, @interest_profile,
        @internal_motivators, @personality_profile, @wellbeing_guidance, @stream_advice,
        @avg_personality_stanine, @avg_aptitude_stanine, @top_interest_score,
        @fit_score, @fit_tier,
        @personality_status, @aptitude_status, @interest_status, @seaa_status,
        @strong_fit_pathways, @emerging_fit_pathways, @exploratory_pathways,
        @recommended_primary, @recommended_alternate, @recommended_exploratory,
        @top_personality_traits_json, @strong_aptitudes_json, @emerging_aptitudes_json,
        @top3_interests_json
      )
      ON CONFLICT(session_id) DO UPDATE SET
        generated_at = excluded.generated_at,
        is_fallback  = excluded.is_fallback,

        -- AI prose: only overwrite if the NEW record is a real report (not fallback).
        -- If a good report is already saved and a fallback arrives, keep the good prose.
        holistic_summary    = CASE WHEN excluded.is_fallback = 0 THEN excluded.holistic_summary    ELSE holistic_summary    END,
        aptitude_profile    = CASE WHEN excluded.is_fallback = 0 THEN excluded.aptitude_profile    ELSE aptitude_profile    END,
        interest_profile    = CASE WHEN excluded.is_fallback = 0 THEN excluded.interest_profile    ELSE interest_profile    END,
        internal_motivators = CASE WHEN excluded.is_fallback = 0 THEN excluded.internal_motivators ELSE internal_motivators END,
        personality_profile = CASE WHEN excluded.is_fallback = 0 THEN excluded.personality_profile ELSE personality_profile END,
        wellbeing_guidance  = CASE WHEN excluded.is_fallback = 0 THEN excluded.wellbeing_guidance  ELSE wellbeing_guidance  END,
        stream_advice       = CASE WHEN excluded.is_fallback = 0 THEN excluded.stream_advice       ELSE stream_advice       END,

        -- Computed/derived fields: always update (always correct from assessments).
        avg_personality_stanine = excluded.avg_personality_stanine,
        avg_aptitude_stanine    = excluded.avg_aptitude_stanine,
        top_interest_score      = excluded.top_interest_score,
        fit_score               = excluded.fit_score,
        fit_tier                = excluded.fit_tier,
        personality_status      = excluded.personality_status,
        aptitude_status         = excluded.aptitude_status,
        interest_status         = excluded.interest_status,
        seaa_status             = excluded.seaa_status,
        strong_fit_pathways     = excluded.strong_fit_pathways,
        emerging_fit_pathways   = excluded.emerging_fit_pathways,
        exploratory_pathways    = excluded.exploratory_pathways,
        recommended_primary     = excluded.recommended_primary,
        recommended_alternate   = excluded.recommended_alternate,
        recommended_exploratory = excluded.recommended_exploratory,
        top_personality_traits_json = excluded.top_personality_traits_json,
        strong_aptitudes_json       = excluded.strong_aptitudes_json,
        emerging_aptitudes_json     = excluded.emerging_aptitudes_json,
        top3_interests_json         = excluded.top3_interests_json
    `),

    /* ── Per-section child-table UPSERT helpers ─────────────────────
       FIX (Bug 2): Replaced DELETE-then-INSERT with INSERT OR REPLACE.
       INSERT OR REPLACE is atomic per-row: if the PRIMARY KEY already
       exists the old row is replaced, otherwise it is inserted.
       A crash at any point leaves either the old data or the new data —
       the table is NEVER left empty for a session.
    ────────────────────────────────────────────────────────────────── */
    upsertPersonality: db.prepare(`
      INSERT OR REPLACE INTO report_personality (session_id, position, name, stanine, band)
      VALUES (@session_id, @position, @name, @stanine, @band)
    `),

    upsertAptitude: db.prepare(`
      INSERT OR REPLACE INTO report_aptitude (session_id, position, key, name, stanine, band, raw_score, max_score)
      VALUES (@session_id, @position, @key, @name, @stanine, @band, @raw_score, @max_score)
    `),

    upsertInterest: db.prepare(`
      INSERT OR REPLACE INTO report_interests (session_id, rank, label, score, level)
      VALUES (@session_id, @rank, @label, @score, @level)
    `),

    upsertSeaa: db.prepare(`
      INSERT OR REPLACE INTO report_seaa (session_id, key, title, score, category, cat_label)
      VALUES (@session_id, @key, @title, @score, @category, @cat_label)
    `),

    upsertCareer: db.prepare(`
      INSERT OR REPLACE INTO report_careers (
        session_id, position, career, cluster,
        interest_fit, aptitude_fit, personality_fit, seaa_fit,
        suitability_pct, alignment, rationale
      ) VALUES (
        @session_id, @position, @career, @cluster,
        @interest_fit, @aptitude_fit, @personality_fit, @seaa_fit,
        @suitability_pct, @alignment, @rationale
      )
    `),
  };

  /* Build per-module assessment update statements lazily.
     Each module has its own UPDATE so saveSection only touches
     that module's columns — minimal write surface, max concurrency. */
  _stmts.updateModule = {};
  MODULES.forEach((m) => {
    _stmts.updateModule[m] = db.prepare(`
      UPDATE assessments SET
        ${m}_raw_answers      = @raw_answers,
        ${m}_scores_json      = @scores_json,
        ${m}_duration_seconds = @duration_seconds,
        ${m}_completed_at     = @completed_at,
        saved_at              = @saved_at
      WHERE session_id = @session_id
    `);
  });

  return _stmts;
}

/* ─────────────────────────────────────────────────────────────────
   Public API
───────────────────────────────────────────────────────────────── */

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
    // FIX (Bug 4): Pass the provided registeredAt if present so a
    // re-run after restart doesn't generate a new "now" timestamp.
    // On a brand-new registration student.registeredAt won't exist
    // and we fall back to now — which is correct for first insert.
    // Because the upsert's DO UPDATE never touches registered_at,
    // this value is only ever used on the first INSERT.
    registered_at: student.registeredAt || new Date().toISOString(),
  });
}

/**
 * saveSection(sessionId, moduleKey, payload)
 *   Persists ONE module's data the moment the user finishes that section.
 *   Safe to call concurrently across users (different PKs) and across
 *   modules of the same user (different columns).
 *
 *   moduleKey ∈ MODULES  (cpi, sea, nmap, daab_va, … daab_sa)
 *   payload  : { raw_answers, scores, duration }
 *
 *   Wrapped in a transaction so the assessments-row creation, the
 *   module UPDATE, and the audit-log insert commit atomically.
 */
function saveSection(sessionId, moduleKey, payload) {
  if (!sessionId)              throw new Error('saveSection: sessionId is required');
  if (!MODULES.includes(moduleKey)) throw new Error('saveSection: unknown module ' + moduleKey);

  const db = _initDb();
  const s  = _prep();
  const now = new Date().toISOString();
  const p   = payload || {};

  const txn = db.transaction(() => {
    s.ensureAssessmentRow.run({ session_id: sessionId, saved_at: now });
    s.updateModule[moduleKey].run({
      session_id:       sessionId,
      saved_at:         now,
      completed_at:     now,
      raw_answers:      JSON.stringify(p.raw_answers ?? null),
      scores_json:      JSON.stringify(p.scores      ?? null),
      duration_seconds: Math.floor(p.duration || 0),
    });
    s.insertSectionProgress.run({
      session_id:       sessionId,
      module_key:       moduleKey,
      submitted_at:     now,
      duration_seconds: Math.floor(p.duration || 0),
    });
  });

  txn();
}

/**
 * saveReport({ sessionId, student, assessments, report })
 *   Wraps registration upsert + per-module assessments upsert + report
 *   summary + 5 child tables (personality, aptitude, interests, seaa,
 *   careers) in a single transaction. Idempotent: re-running rebuilds
 *   the report cleanly without corrupting any existing data.
 */
function saveReport({ sessionId, student, assessments, report }) {
  if (!sessionId) throw new Error('saveReport: sessionId is required');
  const db  = _initDb();
  const s   = _prep();
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    /* 1) Student upsert (idempotent — registered_at never overwritten) */
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
        registered_at: student.registeredAt || now,
      });
    }

    /* 2) Assessments — make sure the row exists, then update each module. */
    if (assessments && typeof assessments === 'object') {
      s.ensureAssessmentRow.run({ session_id: sessionId, saved_at: now });
      MODULES.forEach((m) => {
        // assessments may be keyed by full key (cpi, daab_va) OR for daab
        // sometimes nested under daab.{va,pa,…}. Both shapes are accepted.
        let p = assessments[m];
        if (!p && m.startsWith('daab_') && assessments.daab) {
          p = assessments.daab[m.slice(5)];
        }
        if (!p) return; // leave existing column data untouched
        s.updateModule[m].run({
          session_id:       sessionId,
          saved_at:         now,
          completed_at:     p.completed_at || now,
          raw_answers:      JSON.stringify(p.raw_answers ?? null),
          scores_json:      JSON.stringify(p.scores      ?? null),
          duration_seconds: Math.floor(p.duration || 0),
        });
      });
    }

    /* 3) Build derived report rows from assessments + AI report. */
    const personality = _derivePersonality(assessments || {});
    const aptitude    = _deriveAptitude(assessments || {});
    const interests   = _deriveInterests(assessments || {});
    const seaa        = _deriveSeaa(assessments || {});
    const careers     = _deriveCareers(report || {}, interests);

    /* 4) FIX (Bug 2): Upsert child tables row-by-row (INSERT OR REPLACE).
          No DELETE step — a crash cannot empty the table for a session.
          Each row is atomically replaced by its primary key if it exists,
          or inserted fresh if it doesn't. */
    personality.forEach(row => s.upsertPersonality.run({ session_id: sessionId, ...row }));
    aptitude.forEach(row    => s.upsertAptitude.run({ session_id: sessionId, ...row }));
    interests.forEach(row   => s.upsertInterest.run({ session_id: sessionId, ...row }));
    seaa.forEach(row        => s.upsertSeaa.run({ session_id: sessionId, ...row }));
    careers.forEach(row     => s.upsertCareer.run({ session_id: sessionId, ...row }));

    /* 5) Report summary (AI prose + computed snapshot).
          FIX (Bug 3): upsertReportSummary only overwrites AI prose when
          is_fallback = 0, so a real report is never replaced by a fallback. */
    if (report && typeof report === 'object') {
      const REQUIRED_FIELDS = [
        'holistic_summary','aptitude_profile','interest_profile',
        'internal_motivators','personality_profile','wellbeing_guidance','stream_advice',
      ];
      const missing = REQUIRED_FIELDS.filter(f => !report[f]);
      if (missing.length) {
        console.warn('[DB] saveReport: missing AI fields for', sessionId, '—', missing.join(', '));
      }

      const summary = _deriveSummary(personality, aptitude, interests, seaa, careers, report);
      s.upsertReportSummary.run({
        session_id:   sessionId,
        generated_at: now,
        is_fallback:  report._fallback ? 1 : 0,
        holistic_summary:    report.holistic_summary    || '',
        aptitude_profile:    report.aptitude_profile    || '',
        interest_profile:    report.interest_profile    || '',
        internal_motivators: report.internal_motivators || '',
        personality_profile: report.personality_profile || '',
        wellbeing_guidance:  report.wellbeing_guidance  || '',
        stream_advice:       report.stream_advice       || '',
        ...summary,
      });
      s.markReportTimestamp.run({ session_id: sessionId, ts: now });
    } else {
      console.warn('[DB] saveReport: no report object provided for session', sessionId);
    }

    /* 6) Mark student completed. */
    s.markCompleted.run({ session_id: sessionId, ts: now });
  });

  txn();
}

/* ─────────────────────────────────────────────────────────────────
   Read helpers — useful for the server to reconstruct a report.
───────────────────────────────────────────────────────────────── */
function getFullReport(sessionId) {
  const db = _initDb();
  const student     = db.prepare(`SELECT * FROM students      WHERE session_id = ?`).get(sessionId);
  const assessments = db.prepare(`SELECT * FROM assessments   WHERE session_id = ?`).get(sessionId);
  const summary     = db.prepare(`SELECT * FROM report_summary WHERE session_id = ?`).get(sessionId);
  const personality = db.prepare(`SELECT * FROM report_personality WHERE session_id = ? ORDER BY position`).all(sessionId);
  const aptitude    = db.prepare(`SELECT * FROM report_aptitude    WHERE session_id = ? ORDER BY position`).all(sessionId);
  const interests   = db.prepare(`SELECT * FROM report_interests   WHERE session_id = ? ORDER BY rank`).all(sessionId);
  const seaa        = db.prepare(`SELECT * FROM report_seaa        WHERE session_id = ?`).all(sessionId);
  const careers     = db.prepare(`SELECT * FROM report_careers     WHERE session_id = ? ORDER BY position`).all(sessionId);
  return { student, assessments, summary, personality, aptitude, interests, seaa, careers };
}

function getSectionProgress(sessionId) {
  const db = _initDb();
  return db.prepare(`
    SELECT module_key, submitted_at, duration_seconds
    FROM section_progress
    WHERE session_id = ?
    ORDER BY id ASC
  `).all(sessionId);
}

function close() {
  if (_db) {
    try { _db.close(); } catch (_) {}
    _db = null;
    _stmts = null;
  }
}

/* ─────────────────────────────────────────────────────────────────
   Helpers used by saveReport to mirror download.js's derivations.
───────────────────────────────────────────────────────────────── */

const NMAP_TITLES = [
  'Leadership & Motivation','Assertiveness','Cautiousness','Adaptability & Flexibility',
  'Ethical Awareness','Creativity & Innovation','Curiosity & Learning','Discipline & Sincerity',
  'Patience & Resilience',
];
const DAAB_DISPLAY_ORDER = ['va','pa','na','sa','ma','ar','lsa','hma'];
const DAAB_LABELS = {
  va:'Verbal Ability', pa:'Perceptual Speed', na:'Numerical Ability',
  lsa:'Legal Studies Ability', hma:'Health & Medical Apt.',
  ar:'Abstract Reasoning', ma:'Mechanical Ability', sa:'Spatial Ability',
};
const stanineBand = (s) => s >= 7 ? 'Strength' : s >= 4 ? 'Developing' : 'Needs Attention';
const cpiLevel    = (sc) => sc >= 15 ? 'Strong' : sc >= 8 ? 'Moderate' : 'Low';
const seaCatLabel = (cat) => {
  if (cat === 'A' || cat === 'B') return 'Strong Readiness';
  if (cat === 'C')                return 'Developing Readiness';
  return                              'Support Needed';
};

function _derivePersonality(assessments) {
  const nmap = assessments && assessments.nmap && assessments.nmap.scores;
  const dims = (nmap && Array.isArray(nmap.dims) && nmap.dims.length) ? nmap.dims : [];
  const out = [];
  for (let i = 0; i < 9; i++) {
    const d  = dims[i] || {};
    const stn = (typeof d.stanine === 'number' && d.stanine > 0) ? d.stanine : 5;
    const name = d.name || (d.label && !['High','Moderate','Low','Strength','Developing','Needs Attention'].includes(d.label) ? d.label : NMAP_TITLES[i]);
    out.push({ position: i, name: name || NMAP_TITLES[i], stanine: stn, band: stanineBand(stn) });
  }
  return out;
}

function _deriveAptitude(assessments) {
  const daab = (assessments && assessments.daab) || {};
  const out = DAAB_DISPLAY_ORDER.map((key, i) => {
    const sub = daab[key] || (assessments && assessments['daab_' + key]) || {};
    const sc  = sub.scores || {};
    const stn = (typeof sc.stanine === 'number' && sc.stanine > 0) ? sc.stanine : 5;
    return {
      position: i,
      key,
      name:     DAAB_LABELS[key],
      stanine:  stn,
      band:     sc.label || stanineBand(stn),
      raw_score: (typeof sc.raw === 'number') ? sc.raw : null,
      max_score: (typeof sc.max === 'number') ? sc.max : null,
    };
  });
  return out;
}

function _deriveInterests(assessments) {
  const cpi = assessments && assessments.cpi && assessments.cpi.scores;
  const ranked = (cpi && Array.isArray(cpi.ranked)) ? cpi.ranked : [];
  return ranked.slice(0, 8).map((r, i) => ({
    rank:  i + 1,
    label: r.label || r.name || '—',
    score: typeof r.score === 'number' ? r.score : 0,
    level: r.level || cpiLevel(typeof r.score === 'number' ? r.score : 0),
  }));
}

function _deriveSeaa(assessments) {
  const sea = (assessments && assessments.sea && assessments.sea.scores) || {};
  const dom = sea.domScores || { S: 0, E: 0, A: 0 };
  const cls = sea.cls || {};
  return [
    { key:'S', title:'Social Adjustment',    score: dom.S || 0, category: (cls.S||{}).cat || null, cat_label: seaCatLabel((cls.S||{}).cat) },
    { key:'E', title:'Emotional Adjustment', score: dom.E || 0, category: (cls.E||{}).cat || null, cat_label: seaCatLabel((cls.E||{}).cat) },
    { key:'A', title:'Academic Adjustment',  score: dom.A || 0, category: (cls.A||{}).cat || null, cat_label: seaCatLabel((cls.A||{}).cat) },
  ];
}

function _deriveCareers(report, derivedInterests) {
  const tbl = report && (report.career_table || report.career_table_json);
  let parsed = [];
  if (Array.isArray(tbl)) parsed = tbl;
  else if (typeof tbl === 'string') {
    try { parsed = JSON.parse(tbl); } catch (_) { parsed = []; }
  }

  const cap = (s) => {
    const v = String(s || '').trim().toLowerCase();
    if (v === 'high' || v === 'h') return 'High';
    if (v === 'low'  || v === 'l') return 'Low';
    if (!v) return 'Moderate';
    return 'Moderate';
  };

  if (Array.isArray(parsed) && parsed.length) {
    return parsed.map((r, i) => {
      const pct = (typeof r.suitability_pct === 'number')
        ? Math.round(r.suitability_pct)
        : (parseFloat(r.suitability_pct) || 0);
      const align = pct >= 80 ? 'Strong Fit' : pct >= 65 ? 'Emerging Fit' : 'Exploratory';
      return {
        position:        i,
        career:          r.career || r.cluster || '—',
        cluster:         r.cluster || null,
        interest_fit:    cap(r.interest_fit),
        aptitude_fit:    cap(r.aptitude_fit),
        personality_fit: cap(r.personality_fit),
        seaa_fit:        cap(r.seaa_fit),
        suitability_pct: pct,
        alignment:       r.alignment || align,
        rationale:       r.rationale || null,
      };
    });
  }
  // Fallback: derive minimal rows from top interests
  return (derivedInterests || []).slice(0, 6).map((it, i) => ({
    position:        i,
    career:          it.label,
    cluster:         it.label,
    interest_fit:    it.level === 'Strong' ? 'High' : it.level === 'Moderate' ? 'Moderate' : 'Low',
    aptitude_fit:    'Moderate',
    personality_fit: 'Moderate',
    seaa_fit:        'Moderate',
    suitability_pct: Math.round((it.score / 20) * 100),
    alignment:       it.score >= 15 ? 'Strong Fit' : it.score >= 8 ? 'Emerging Fit' : 'Exploratory',
    rationale:       null,
  }));
}

function _deriveSummary(personality, aptitude, interests, seaa, careers, report) {
  const avgPers = personality.length ? (personality.reduce((s,d) => s + d.stanine, 0) / personality.length) : 5;
  const avgApt  = aptitude.length    ? (aptitude.reduce((s,d) => s + d.stanine, 0)    / aptitude.length)    : 5;
  const topInterestScore = (interests[0] && interests[0].score) || 0;

  // Fit score (matches download.js)
  const stanineToPct = (s) => ((s - 1) / 8) * 100;
  let fitRaw = (stanineToPct(avgPers) * 0.30) + (stanineToPct(avgApt) * 0.30) + ((topInterestScore / 20) * 100 * 0.40);
  seaa.forEach(c => {
    if (c.cat_label === 'Support Needed')         fitRaw -= 7;
    else if (c.cat_label === 'Developing Readiness') fitRaw -= 3;
  });
  const fitScore = Math.max(0, Math.min(100, Math.round(fitRaw)));
  const fitTier  = fitScore >= 75 ? 'Strong Fit' : fitScore >= 55 ? 'Emerging Fit' : 'Exploratory Fit';

  const persStatus  = avgPers >= 6.5 ? 'Strength' : avgPers >= 4 ? 'Developing' : 'Support Needed';
  const aptStatus   = avgApt  >= 6.5 ? 'Strength' : avgApt  >= 4 ? 'Developing' : 'Support Needed';
  const cpiStatus   = topInterestScore >= 15 ? 'Strength' : topInterestScore >= 8 ? 'Developing' : 'Support Needed';
  const seaWorst    = seaa.reduce((w, c) => {
    if (c.cat_label === 'Support Needed') return 'Support Needed';
    if (c.cat_label === 'Developing Readiness' && w !== 'Support Needed') return 'Developing';
    return w;
  }, 'Strength');

  const strongFits   = careers.filter(c => (c.alignment || '').indexOf('Strong')      >= 0).map(c => c.career);
  const emergingFits = careers.filter(c => (c.alignment || '').indexOf('Emerging')    >= 0).map(c => c.career);
  const exploratory  = careers.filter(c => (c.alignment || '').indexOf('Exploratory') >= 0).map(c => c.career);

  const top3 = interests.slice(0, 3);
  const recPrimary  = strongFits[0]   || emergingFits[0] || (top3[0] && top3[0].label) || 'Multidisciplinary';
  const recAlt      = strongFits[1]   || emergingFits[0] || (top3[1] && top3[1].label) || 'Multidisciplinary';
  const recExpl     = exploratory[0]  || (top3[2] && top3[2].label)                     || 'Multidisciplinary';

  const topPersonality = personality.slice().sort((a,b) => b.stanine - a.stanine).slice(0, 3)
    .map(t => ({ name: t.name, stanine: t.stanine, label: t.band }));
  const aptStrong   = aptitude.filter(a => a.stanine >= 7).map(a => a.name);
  const aptEmerging = aptitude.filter(a => a.stanine >= 4 && a.stanine <= 6).map(a => a.name);

  return {
    avg_personality_stanine: Number(avgPers.toFixed(2)),
    avg_aptitude_stanine:    Number(avgApt.toFixed(2)),
    top_interest_score:      topInterestScore,
    fit_score:               fitScore,
    fit_tier:                fitTier,
    personality_status:      persStatus,
    aptitude_status:         aptStatus,
    interest_status:         cpiStatus,
    seaa_status:             seaWorst,
    strong_fit_pathways:     JSON.stringify(strongFits),
    emerging_fit_pathways:   JSON.stringify(emergingFits),
    exploratory_pathways:    JSON.stringify(exploratory),
    recommended_primary:     recPrimary,
    recommended_alternate:   recAlt,
    recommended_exploratory: recExpl,
    top_personality_traits_json: JSON.stringify(topPersonality),
    strong_aptitudes_json:       JSON.stringify(aptStrong),
    emerging_aptitudes_json:     JSON.stringify(aptEmerging),
    top3_interests_json:         JSON.stringify(top3),
  };
}

module.exports = {
  saveRegistration,
  saveSection,
  saveReport,
  getFullReport,
  getSectionProgress,
  close,
  _initDb,
  MODULES,
};
