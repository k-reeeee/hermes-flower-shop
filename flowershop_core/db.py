"""SQLite store: one canonical database, numbered migrations, serialized writes.

Writes go through ``Store.tx()``, which opens ``BEGIN IMMEDIATE`` (takes the write lock
up front, so two concurrent reservations serialize instead of both reading stale stock),
commits, then emits change events. Reads use ``Store.read()``.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from . import clock, events

PLUGIN_ID = "flower-shop"
DB_FILENAME = "flowershop.db"
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def default_db_path() -> Path:
    override = os.environ.get("FLOWERSHOP_DB_PATH")
    if override:
        return Path(override)
    try:  # sanctioned per-plugin data root, follows the active profile
        from plugins.plugin_storage import plugin_data_dir

        return plugin_data_dir(PLUGIN_ID) / DB_FILENAME
    except Exception:
        try:
            from hermes_constants import get_hermes_home

            home = Path(get_hermes_home())
        except Exception:
            home = Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")
        root = home / "plugin-data" / PLUGIN_ID
        root.mkdir(parents=True, exist_ok=True)
        return root / DB_FILENAME


class Tx:
    """Connection wrapper used inside a write transaction."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn
        self.events: list[dict] = []
        self.now = clock.now_iso()

    def execute(self, sql: str, params: Any = ()) -> sqlite3.Cursor:
        return self.conn.execute(sql, params)

    def one(self, sql: str, params: Any = ()) -> sqlite3.Row | None:
        return self.conn.execute(sql, params).fetchone()

    def all(self, sql: str, params: Any = ()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, params).fetchall()

    def insert(self, sql: str, params: Any = ()) -> int:
        return int(self.conn.execute(sql, params).lastrowid)

    def changed(self, entity_type: str, entity_id: Any, action: str, actor: str) -> None:
        self.events.append({"entity_type": entity_type, "entity_id": entity_id, "action": action, "actor": actor})

    def audit(self, entity_type: str, entity_id: Any, action: str, actor: str, *, reason: str | None = None,
              before: Any = None, after: Any = None) -> None:
        self.conn.execute(
            "INSERT INTO audit_events(entity_type, entity_id, action, actor, reason, before_state, after_state, created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (entity_type, entity_id, action, actor, reason,
             json.dumps(before, default=str) if before is not None else None,
             json.dumps(after, default=str) if after is not None else None, self.now),
        )
        self.changed(entity_type, entity_id, action, actor)


class Store:
    def __init__(self, path: str | os.PathLike | None = None) -> None:
        self.path = Path(path) if path else default_db_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._migrate_lock = threading.Lock()
        self._migrated = False
        self.migrate()

    # -- connections -----------------------------------------------------------------
    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=10, isolation_level=None, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        try:
            conn.execute("PRAGMA journal_mode = WAL")
        except sqlite3.DatabaseError:
            pass  # network FS: fall back to default journal
        return conn

    def conn(self) -> sqlite3.Connection:
        c = getattr(self._local, "conn", None)
        if c is None:
            c = self._connect()
            self._local.conn = c
        return c

    def close(self) -> None:
        c = getattr(self._local, "conn", None)
        if c is not None:
            c.close()
            self._local.conn = None

    # -- migrations ------------------------------------------------------------------
    def migrate(self) -> int:
        with self._migrate_lock:
            c = self.conn()
            c.execute("BEGIN IMMEDIATE")
            try:
                c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)")
                applied = {r[0] for r in c.execute("SELECT version FROM schema_migrations")}
                for f in sorted(MIGRATIONS_DIR.glob("*.sql")):
                    version = int(f.name.split("_", 1)[0])
                    if version in applied:
                        continue
                    for stmt in _split_sql(f.read_text()):
                        c.execute(stmt)
                    c.execute("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", (version, clock.now_iso()))
                c.execute("COMMIT")
            except Exception:
                c.execute("ROLLBACK")
                raise
            self._migrated = True
            return self.schema_version()

    def schema_version(self) -> int:
        row = self.conn().execute("SELECT MAX(version) FROM schema_migrations").fetchone()
        return int(row[0] or 0)

    # -- transactions ----------------------------------------------------------------
    @contextmanager
    def tx(self) -> Iterator[Tx]:
        c = self.conn()
        if c.in_transaction:  # nested call: join the outer transaction
            yield Tx(c)
            return
        c.execute("BEGIN IMMEDIATE")
        t = Tx(c)
        try:
            yield t
        except BaseException:
            c.execute("ROLLBACK")
            raise
        else:
            c.execute("COMMIT")
            events.emit(t.events)

    def read(self) -> Tx:
        return Tx(self.conn())


def _split_sql(script: str) -> list[str]:
    """Split on ';' but keep CREATE TRIGGER ... BEGIN ... END; blocks intact."""
    out, buf, depth = [], [], 0
    for line in script.splitlines():
        stripped = line.strip()
        if stripped.startswith("--") or not stripped:
            continue
        buf.append(line)
        upper = stripped.upper()
        if upper.startswith("CREATE TRIGGER") or " BEGIN" in f" {upper}" and "CREATE TRIGGER" in " ".join(buf).upper():
            depth = 1
        if depth and upper.endswith("END;"):
            depth = 0
            out.append("\n".join(buf))
            buf = []
            continue
        if not depth and stripped.endswith(";"):
            out.append("\n".join(buf))
            buf = []
    if buf:
        out.append("\n".join(buf))
    return [s for s in out if s.strip()]


_default_store: Store | None = None
_default_lock = threading.Lock()


def get_store() -> Store:
    """Process-wide store for the active Hermes home (re-resolved if the path changes)."""
    global _default_store
    path = default_db_path()
    with _default_lock:
        if _default_store is None or _default_store.path != path:
            _default_store = Store(path)
        return _default_store


def row_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def loads(value: str | None, default: Any = None) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default
