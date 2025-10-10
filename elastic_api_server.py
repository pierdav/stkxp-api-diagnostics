#!/usr/bin/env python3
"""
Elastic API Diagnostic Server
Serves routes based on elastic-rest.yml configuration and serves corresponding data files
"""

import os
import yaml
from pathlib import Path
from fastapi import FastAPI, Response
from fastapi.responses import PlainTextResponse, JSONResponse
import uvicorn
import re
from typing import Dict, Any, Optional

app = FastAPI(title="Elastic API Diagnostic Server")

# Configuration
DATA_DIR = Path("/root/data/api-diagnostics-20240416-135824")
CONFIG_FILE = DATA_DIR / "elastic-rest.yml"

# Global route mapping: {endpoint_path: file_path}
ROUTE_MAP: Dict[str, Path] = {}


def load_elastic_config() -> Dict[str, Any]:
    """Load elastic-rest.yml configuration"""
    with open(CONFIG_FILE, 'r') as f:
        return yaml.safe_load(f)


def extract_route_from_query(query: str) -> str:
    """Extract clean route path from query string (remove query params for mapping)"""
    # Remove query parameters for file mapping
    return query.split('?')[0]


def build_route_mapping(config: Dict[str, Any]):
    """Build mapping between API routes and data files"""
    for name, spec in config.items():
        if not isinstance(spec, dict) or 'versions' not in spec:
            continue

        # Get latest version query (last entry typically most recent)
        versions = spec.get('versions', {})
        if not versions:
            continue

        # Get the last (most recent) version query
        latest_query = list(versions.values())[-1]

        # Build file path
        extension = spec.get('extension', '.json')
        subdir = spec.get('subdir', '')

        if subdir:
            file_path = DATA_DIR / subdir / f"{name}{extension}"
        else:
            file_path = DATA_DIR / f"{name}{extension}"

        # Extract route path from query
        route = extract_route_from_query(latest_query)

        # Store mapping
        if file_path.exists():
            ROUTE_MAP[route] = file_path
            print(f"✓ Mapped: {route} -> {file_path.name}")
        else:
            print(f"✗ Missing file for {name}: {file_path}")


def register_routes():
    """Register all routes dynamically from mapping"""

    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        """Handle all routes dynamically"""
        # Try exact match first
        route = f"/{full_path}"

        # Try to find matching route
        file_path = ROUTE_MAP.get(route)

        # If not found, try without query params
        if not file_path:
            base_route = route.split('?')[0]
            file_path = ROUTE_MAP.get(base_route)

        # If still not found, try partial matching (for wildcard routes)
        if not file_path:
            for mapped_route, mapped_file in ROUTE_MAP.items():
                if route.startswith(mapped_route.rstrip('*')):
                    file_path = mapped_file
                    break

        if not file_path or not file_path.exists():
            return JSONResponse(
                status_code=404,
                content={"error": f"Route not found: {route}"}
            )

        # Read and return file content
        content = file_path.read_text()

        # Determine content type
        if file_path.suffix == '.json':
            return Response(content=content, media_type="application/json")
        elif file_path.suffix == '.txt':
            return PlainTextResponse(content=content)
        else:
            return Response(content=content, media_type="text/plain")


@app.get("/")
async def root():
    """Root endpoint - show available routes"""
    routes_list = sorted(ROUTE_MAP.keys())
    return {
        "server": "Elastic API Diagnostic Server",
        "routes_count": len(routes_list),
        "routes": routes_list[:20],  # Show first 20
        "note": f"Total {len(routes_list)} routes available"
    }


def main():
    """Initialize server and load routes"""
    print("=" * 60)
    print("Elastic API Diagnostic Server")
    print("=" * 60)

    # Load configuration and build mappings
    print(f"\n📋 Loading configuration from: {CONFIG_FILE}")
    config = load_elastic_config()
    print(f"✓ Loaded {len(config)} API definitions")

    print(f"\n🗂️  Building route mappings...")
    build_route_mapping(config)
    print(f"✓ Registered {len(ROUTE_MAP)} routes")

    # Register routes
    register_routes()

    # Start server
    print(f"\n🚀 Starting server on http://0.0.0.0:8080")
    print("=" * 60)
    print("\n📝 Example routes:")
    examples = [
        "/_cat/aliases?v&s=alias,index",
        "/_nodes/stats/indices/fielddata?level=shards&fields=*",
        "/_cluster/health",
        "/_cat/indices?v"
    ]
    for ex in examples:
        if any(ex.startswith(r) for r in ROUTE_MAP.keys()):
            print(f"   http://localhost:8080{ex}")
    print("\n")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )


if __name__ == "__main__":
    main()
