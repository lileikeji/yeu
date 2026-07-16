import json
import os
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path


HOME = Path(r"F:\C_Drive_Migration\.codex")
PROVIDER = "custom"


def canonical(path: Path) -> Path:
    value = os.fspath(path)
    if value.startswith("\\\\?\\UNC\\"):
        value = "\\\\" + value[8:]
    elif value.startswith("\\\\?\\"):
        value = value[4:]
    return Path(value)


def backup_database(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
        src.backup(dst)


def update_session(path: Path) -> bool:
    raw = path.read_bytes()
    first, separator, remainder = raw.partition(b"\n")
    record = json.loads(first.decode("utf-8"))
    if record.get("type") != "session_meta":
        return False
    payload = record.setdefault("payload", {})
    if payload.get("model_provider") == PROVIDER:
        return False
    payload["model_provider"] = PROVIDER
    encoded = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    temporary = path.with_name(f".{path.name}.provider-migration.tmp")
    temporary.write_bytes(encoded + (separator + remainder if separator else b""))
    os.replace(temporary, path)
    return True


def main() -> None:
    state_path = HOME / "state_5.sqlite"
    catalog_path = HOME / "sqlite" / "codex-dev.db"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup_dir = HOME / "backups" / f"surviving-data-{stamp}"
    backup_database(state_path, backup_dir / state_path.name)
    backup_database(catalog_path, backup_dir / "sqlite" / catalog_path.name)

    state = sqlite3.connect(state_path, timeout=30)
    state.row_factory = sqlite3.Row
    catalog = sqlite3.connect(catalog_path, timeout=30)
    try:
        rows = state.execute(
            """
            SELECT id, rollout_path, created_at, updated_at, source, cwd, title, git_branch
            FROM threads
            WHERE id NOT IN (SELECT child_thread_id FROM thread_spawn_edges)
            ORDER BY updated_at, id
            """
        ).fetchall()
        existing_sessions = []
        missing = 0
        for row in rows:
            path = canonical(Path(row["rollout_path"]))
            if not path.is_absolute():
                path = HOME / path
            if path.exists():
                existing_sessions.append(path)
                destination = backup_dir / "sessions" / path.name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination)
            else:
                missing += 1

        ids = [row["id"] for row in rows]
        placeholders = ",".join("?" for _ in ids)
        state.execute("BEGIN IMMEDIATE")
        state.execute(
            f"UPDATE threads SET model_provider=? WHERE id IN ({placeholders})",
            (PROVIDER, *ids),
        )
        state.commit()

        catalog.execute("BEGIN IMMEDIATE")
        catalog.execute(
            f"UPDATE local_thread_catalog SET model_provider=? WHERE host_id='local' AND thread_id IN ({placeholders})",
            (PROVIDER, *ids),
        )
        existing = {
            row[0]
            for row in catalog.execute(
                f"SELECT thread_id FROM local_thread_catalog WHERE host_id='local' AND thread_id IN ({placeholders})",
                ids,
            )
        }
        sequence = catalog.execute(
            "SELECT COALESCE(MAX(observation_sequence),0) FROM local_thread_catalog WHERE host_id='local'"
        ).fetchone()[0]
        inserted = 0
        for row in rows:
            if row["id"] in existing:
                continue
            sequence += 1
            catalog.execute(
                """
                INSERT INTO local_thread_catalog (
                    host_id, thread_id, display_title, source_created_at, source_updated_at,
                    cwd, source_kind, source_detail, model_provider, git_branch,
                    observation_sequence, missing_candidate
                ) VALUES ('local', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)
                """,
                (
                    row["id"], row["title"] or "", float(row["created_at"]),
                    float(row["updated_at"]), row["cwd"] or "", row["source"] or "vscode",
                    PROVIDER, row["git_branch"], sequence,
                ),
            )
            inserted += 1
        catalog.commit()

        changed_sessions = sum(update_session(path) for path in existing_sessions)
        state_ok = state.execute("PRAGMA integrity_check").fetchone()[0]
        catalog_ok = catalog.execute("PRAGMA integrity_check").fetchone()[0]
        print(f"top_level={len(rows)} missing_sessions={missing} existing_sessions={len(existing_sessions)}")
        print(f"catalog_inserted={inserted} sessions_updated={changed_sessions}")
        print(f"integrity: state={state_ok} catalog={catalog_ok}")
        print(f"backup={backup_dir}")
    except Exception:
        state.rollback()
        catalog.rollback()
        raise
    finally:
        catalog.close()
        state.close()


if __name__ == "__main__":
    main()
