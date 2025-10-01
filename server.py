# dynamic_api.py  — version robuste
import re, json, uvicorn
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import json5                         # facultatif, pour JSON “souple”
    json_parser = json5
except ImportError:
    json_parser = json

FILE = Path("csf/ELK_TAL_Pro.txt")
HDR  = re.compile(r"^#\s*\d+:\s*GET\s+(\S+)\s+\d+\s*\w*", re.I)

def clean(text: str) -> str:
    text = re.sub(r"//.*?$|#.*?$", "", text, flags=re.M)   # commentaires
    text = text.replace("...", "null")                     # ellipses
    text = re.sub(r",\s*([}\]])", r"\1", text)             # virgules finales
    return text

def load_routes(fp: Path) -> Dict[str, Any]:
    """Load routes from file with proper error handling."""
    routes, cur, buf = {}, None, []
    
    try:
        if not fp.exists():
            logger.error(f"File {fp} does not exist")
            return {}
        
        content = fp.read_text(encoding='utf-8')
        for ln in content.splitlines():
            if m := HDR.match(ln):
                if cur and buf:
                    try:
                        json_content = clean("\n".join(buf))
                        
                        routes[cur] = json_parser.loads(json_content)
                        logger.info(f"Loaded route {cur}")
                    except (json.JSONDecodeError, Exception) as e:
                        logger.error(f"Failed to parse JSON for route {cur}: {e}")
                        continue
                    buf.clear()
                cur = m.group(1) if m.group(1).startswith("/") else "/" + m.group(1)
            elif cur:
                buf.append(ln)
        
        if cur and buf:
            try:
                json_content = clean("\n".join(buf))
                routes[cur] = json_parser.loads(json_content)
                logger.info(f"Loaded route {cur}")
            except (json.JSONDecodeError, Exception) as e:
                logger.error(f"Failed to parse JSON for final route {cur}: {e}")
    
    except Exception as e:
        logger.error(f"Error reading file {fp}: {e}")
        return {}
    
    return routes

app = FastAPI(title="Dynamic API")

def create_endpoint(endpoint_payload: Any):
    """Create endpoint function with proper closure."""
    async def _endpoint():
        print(endpoint_payload)
        try:
            return JSONResponse(content=endpoint_payload)
        except Exception as e:
            logger.error(f"Error in endpoint: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")
    return _endpoint

# Load routes and create endpoints
try:
    print(FILE.resolve())
    routes = load_routes(FILE)
    if not routes:
        logger.warning("No routes loaded from file")
    
    for path, payload in routes.items():
        if not isinstance(path, str) or not path.startswith("/"):
            logger.warning(f"Invalid route path: {path}")
            continue
        
        endpoint_func = create_endpoint(payload)
        app.add_api_route(path, endpoint_func, methods=["GET"])
        logger.info(f"Registered route: {path}")
        
except Exception as e:
    logger.error(f"Error setting up routes: {e}")

if __name__ == "__main__":
    # HTTPS configuration with certificates
    ssl_keyfile = "/root/docker/diagnostics/certificates/kib002/kib002.key"
    ssl_certfile = "/root/docker/diagnostics/certificates/kib002/kib002.crt"
    ssl_ca_certs = "/root/docker/diagnostics/certificates/ca-8/ca.crt"
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8443,  # Standard HTTPS port
        ssl_keyfile=ssl_keyfile,
        ssl_certfile=ssl_certfile,
        ssl_ca_certs=ssl_ca_certs
    )
