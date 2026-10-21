"""Run the installed immutable local bot sources, regardless of caller cwd."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

if __name__ == '__main__':
    from mukmuk.local_bot import main
    main()
