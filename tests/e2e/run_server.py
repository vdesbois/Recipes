import argparse
import signal
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.server import create_server


def main():
    parser = argparse.ArgumentParser(description="Start the isolated Playwright test server.")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()

    database_path = PROJECT_ROOT / "test-results" / "playwright.sqlite3"
    database_path.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-shm", "-wal"):
        Path(f"{database_path}{suffix}").unlink(missing_ok=True)

    server = create_server("127.0.0.1", args.port, database_path)
    print(f"Playwright test server running at http://127.0.0.1:{args.port}")

    def stop_server(_signal_number, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_server)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
