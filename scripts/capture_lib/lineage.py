"""
Lineage: tracks captured skills, prevents duplicates, supports DERIVED evolution.
"""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


_SCHEMA = """
CREATE TABLE IF NOT EXISTS captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    task_description TEXT,
    confidence REAL,
    evolution_type TEXT,
    parent_skill_id TEXT,
    skill_path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skill_id ON captures(skill_id);
"""


class SkillLineage:
    def __init__(self, skills_path: str) -> None:
        db_path = Path(skills_path) / ".skillforge-lineage.db"
        self._conn = sqlite3.connect(str(db_path))
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def find_similar(self, skill_id: str, candidate_ids: list) -> "str | None":
        """Return an existing skill_id that shares the same base name (before -vN).

        E.g. if skill_id is "debug-imports" and "debug-imports-v2" is in candidate_ids,
        return "debug-imports-v2". Returns None if no similar skill found.
        """
        # Strip trailing -vN from the incoming id to get the base
        import re
        base = re.sub(r"-v\d+$", "", skill_id)

        for cid in candidate_ids:
            # The candidate's base (strip -vN)
            cbase = re.sub(r"-v\d+$", "", cid)
            if cbase == base and cid != skill_id:
                return cid

        return None

    def record(
        self,
        skill_id: str,
        session_id: str,
        task_description: str,
        confidence: float,
        evolution_type: str,
        parent_skill_id: "str | None",
        skill_path: str,
    ) -> None:
        captured_at = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO captures
                (skill_id, session_id, captured_at, task_description,
                 confidence, evolution_type, parent_skill_id, skill_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                skill_id,
                session_id,
                captured_at,
                task_description,
                confidence,
                evolution_type,
                parent_skill_id,
                skill_path,
            ),
        )
        self._conn.commit()

    def get_all_skill_ids(self) -> list:
        cursor = self._conn.execute("SELECT DISTINCT skill_id FROM captures")
        return [row[0] for row in cursor.fetchall()]

    def close(self) -> None:
        self._conn.close()
