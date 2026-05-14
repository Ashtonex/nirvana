import os
import sys
from pathlib import Path

# Add project root to sys.path
root = Path(__file__).resolve().parents[1]
sys.path.append(str(root))

from intelligence.main import app

# This file is the entry point for Vercel Serverless Functions.
# Vercel will look for an 'app' or 'application' variable in api/*.py files.
# By exporting the FastAPI app here, we make it available at /api/index
# We can also use vercel.json to rewrite /api/py/* to this file.
