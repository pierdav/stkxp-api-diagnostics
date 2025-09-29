# CLAUDE.md - STKXP API Diagnostics

This file provides guidance to Claude Code when working with the STKXP API Diagnostics toolkit.

## Project Overview

This is a **diagnostic and testing toolkit** designed to support the Stack Expert ecosystem with mock services, SSL certificate testing, and API validation tools. The toolkit includes:

- **Dynamic API server** (FastAPI) for endpoint simulation
- **Apache metrics simulator** (Node.js) for realistic performance testing  
- **Database connectivity tools** for MySQL/database testing
- **SSL/TLS certificate validation** with proper certificate chain support

## Common Development Commands

```bash
# Dynamic API Server (Python FastAPI)
cd /root/stkxp-api-diagnostics
python server.py                    # Start HTTPS server on port 8443

# Apache Metrics Simulator (Node.js)
npm install express prom-client     # Install dependencies
node apache-http.js                 # Start HTTP server on port 8080

# Environment Configuration
export PORT=8443                    # Set custom port
export HOST=0.0.0.0                # Set bind address
export INIT_REQ_PER_SEC=50         # Initial traffic rate

# SSL Certificate Validation  
openssl x509 -in certificates/kib002/kib002.crt -text -noout
openssl verify -CAfile certificates/ca-8/ca.crt certificates/kib002/kib002.crt
```

## Architecture Components

### Dynamic API Server (`server.py`)

**Purpose**: Creates API endpoints dynamically from configuration files

**Key Features**:
- **FastAPI framework** with automatic OpenAPI documentation
- **SSL/TLS support** with certificate chain validation
- **JSON5 parsing** for flexible configuration syntax
- **Automatic route registration** from text-based config
- **Error handling** with comprehensive logging

**Code Structure**:
```python
# Core functionality
app = FastAPI(title="Dynamic API")

def load_routes(fp: Path) -> Dict[str, Any]:
    """Parse configuration file and extract routes"""
    
def create_endpoint(endpoint_payload: Any):
    """Create endpoint function with proper closure"""
    
def clean(text: str) -> str:
    """Clean JSON configuration removing comments"""
```

**Configuration Format** (`d4.txt`):
```
# Comment: Route ID: GET /api/endpoint STATUS_CODE
{
  "status": "success", 
  "data": { "key": "value" }
}
```

### Apache Metrics Simulator (`apache-http.js`)

**Purpose**: Simulates realistic Apache HTTP server with dynamic metrics

**Key Features**:
- **Express.js framework** with multiple endpoint formats
- **Prometheus metrics** integration with prom-client
- **Gaussian noise simulation** for realistic traffic patterns
- **Scoreboard generation** mimicking mod_status
- **Runtime configuration** via POST endpoints

**Code Structure**:
```javascript
// State management
const state = {
  startTime: Date.now(),
  total_accesses: 0,
  req_per_sec: INIT_REQ_PER_SEC,
  cpu_load: 0.05,
  active_workers: 5,
  // ... additional metrics
};

// Simulation engine
function tickSimulation() {
  // Gaussian noise for realistic variation
  const noise = randGaussian(0, state.req_per_sec * 0.07);
  // Traffic spike simulation (2% probability)
  if (Math.random() < 0.02) next_req *= 1 + Math.random() * 3;
}

// Endpoint handlers  
app.get("/api/status", (req, res) => { /* JSON format */ });
app.get("/server-status", (req, res) => { /* mod_status format */ });
app.get("/metrics", (req, res) => { /* Prometheus format */ });
```

**Available Endpoints**:
- `GET /api/status` - Detailed JSON metrics
- `GET /server-status?auto` - mod_status compatible output  
- `GET /metrics` - Prometheus format metrics
- `POST /admin/set` - Runtime configuration

### SSL Certificate Management

**Certificate Structure**:
```
certificates/
├── ca-8/
│   └── ca.crt                    # Certificate Authority
└── kib002/ 
    ├── kib002.crt               # Server certificate
    └── kib002.key               # Private key
```

**SSL Configuration** (server.py):
```python
ssl_keyfile = "/root/docker/diagnostics/certificates/kib002/kib002.key"
ssl_certfile = "/root/docker/diagnostics/certificates/kib002/kib002.crt"  
ssl_ca_certs = "/root/docker/diagnostics/certificates/ca-8/ca.crt"

uvicorn.run(app, 
    host="0.0.0.0",
    port=8443,
    ssl_keyfile=ssl_keyfile,
    ssl_certfile=ssl_certfile,
    ssl_ca_certs=ssl_ca_certs
)
```

## Usage Patterns

### Dynamic API Testing

```bash
# 1. Configure endpoints in d4.txt
echo "# 1: GET /api/test 200 OK" >> d4.txt
echo '{"test": true, "message": "Hello"}' >> d4.txt

# 2. Start the server
python server.py

# 3. Test the endpoint  
curl -k https://localhost:8443/api/test
```

### Apache Metrics Simulation

```bash
# 1. Start simulator
node apache-http.js

# 2. Check different formats
curl http://localhost:8080/api/status          # JSON
curl http://localhost:8080/server-status?auto # mod_status  
curl http://localhost:8080/metrics             # Prometheus

# 3. Adjust parameters
curl -X POST http://localhost:8080/admin/set \
  -H "Content-Type: application/json" \
  -d '{"req_per_sec": 100, "cpu_load": 0.8}'
```

### Integration with Stack Expert

```bash
# Test route generation against diagnostic endpoints
cd /root/stkxp-backend
# Configure test endpoints in diagnostic server
python /root/stkxp-api-diagnostics/server.py &

# Generate routes that point to diagnostic endpoints
node routes/generate-query-routes.cjs

# Validate endpoints
curl -k https://localhost:8443/api/stack_expert/test/namespace/endpoint
```

## Development Patterns

### Adding New Diagnostic Endpoints

**For Dynamic API (server.py)**:
1. **Edit d4.txt configuration**:
```
# 5: GET /api/new-endpoint 200 OK
{
  "endpoint": "new-endpoint",
  "data": { "key": "value" },
  "timestamp": "2025-01-01T00:00:00Z"
}
```

2. **Restart server** to load new configuration
3. **Test endpoint**: `curl -k https://localhost:8443/api/new-endpoint`

**For Apache Simulator (apache-http.js)**:
1. **Add new route**:
```javascript
app.get("/api/custom-metric", (req, res) => {
  res.json({
    custom_metric: Math.random() * 100,
    timestamp: Date.now()
  });
});
```

2. **Update Prometheus metrics** if needed:
```javascript
const gauge_custom = new client.Gauge({
  name: "apache_fake_custom_metric", 
  help: "Custom diagnostic metric"
});
```

### SSL Certificate Testing

```bash
# Verify certificate chain
openssl verify -CAfile certificates/ca-8/ca.crt certificates/kib002/kib002.crt

# Test SSL connection
openssl s_client -connect localhost:8443 -CAfile certificates/ca-8/ca.crt

# Generate new certificates (if needed)
openssl genrsa -out new-server.key 2048
openssl req -new -key new-server.key -out new-server.csr
openssl x509 -req -in new-server.csr -CA ca.crt -CAkey ca.key -out new-server.crt
```

### Database Connectivity Testing

**MySQL connection example** (mysql.js):
```javascript
const mysql = require('mysql2/promise');

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'test_user', 
  password: 'test_password',
  database: 'test_db',
  ssl: {
    ca: fs.readFileSync('/path/to/ca.crt'),
    cert: fs.readFileSync('/path/to/client.crt'),
    key: fs.readFileSync('/path/to/client.key')
  }
});
```

## Configuration Management

### Environment Variables

```bash
# Dynamic API Server
export DIAGNOSTIC_PORT=8443
export DIAGNOSTIC_HOST=0.0.0.0
export CERT_PATH=/root/docker/diagnostics/certificates
export CONFIG_FILE=/root/stkxp-api-diagnostics/d4.txt

# Apache Simulator
export APACHE_PORT=8080
export INIT_REQ_PER_SEC=50
export ENABLE_ADMIN_API=true
export PROMETHEUS_ENABLED=true

# SSL Configuration
export SSL_VERIFY=true
export SSL_CERT_FILE=kib002.crt
export SSL_KEY_FILE=kib002.key
export SSL_CA_FILE=ca.crt
```

### Configuration Files

**d4.txt format**:
```
# Route definitions with comments
# ID: METHOD /path STATUS_CODE [DESCRIPTION]
# JSON payload follows

# 1: GET /api/health 200 OK
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z",
  "uptime": 3600
}

# 2: POST /api/data 201 Created
{
  "id": 123,
  "created": true,
  "data": { "sample": "value" }
}
```

## Testing and Validation

### Endpoint Testing

```bash
# Test dynamic API endpoints
python -c "
import requests
response = requests.get('https://localhost:8443/api/health', verify=False)
print(f'Status: {response.status_code}')
print(f'Data: {response.json()}')
"

# Test Apache simulation
curl -s http://localhost:8080/api/status | jq '.req_per_sec'
curl -s http://localhost:8080/metrics | grep apache_fake_requests_per_second
```

### SSL/TLS Validation

```bash
# Validate SSL configuration
python -c "
import ssl
import socket
context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
context.load_verify_locations('/root/docker/diagnostics/certificates/ca-8/ca.crt')
with socket.create_connection(('localhost', 8443)) as sock:
    with context.wrap_socket(sock, server_hostname='kib002') as ssock:
        print(f'SSL Version: {ssock.version()}')
        print(f'Cipher: {ssock.cipher()}')
"
```

### Performance Testing

```bash
# Load test Apache simulator
ab -n 1000 -c 10 http://localhost:8080/api/status

# Monitor metrics during load
watch -n 1 'curl -s http://localhost:8080/api/status | jq ".req_per_sec, .cpu_load, .active_workers"'

# Stress test dynamic API
ab -n 500 -c 5 https://localhost:8443/api/health
```

## Integration Points

### With Stack Expert Plugin
- **Route validation** against diagnostic endpoints
- **SSL certificate testing** for secure communications
- **Metrics collection** testing and validation

### With stkxp-backend  
- **Route generation testing** using diagnostic endpoints as targets
- **Query validation** against mock data responses
- **Performance benchmarking** of route generation

### With stkxp-app
- **Frontend API testing** against diagnostic endpoints  
- **Error handling validation** using controlled error responses
- **SSL connection testing** from frontend components

## Troubleshooting

### Common Issues

**SSL Certificate Problems**:
```bash
# Check certificate validity
openssl x509 -in certificates/kib002/kib002.crt -noout -dates

# Verify certificate chain
openssl verify -verbose -CAfile certificates/ca-8/ca.crt certificates/kib002/kib002.crt

# Test SSL connection
curl -k -v https://localhost:8443/api/health
```

**Port Binding Issues**:
```bash
# Check port availability  
netstat -tulpn | grep 8443
lsof -i :8443

# Use alternative port
PORT=8444 python server.py
```

**Route Loading Failures**:
```bash
# Validate d4.txt syntax
python -c "
import re
from pathlib import Path
content = Path('d4.txt').read_text()
# Check for JSON syntax errors
"

# Debug route parsing
python -c "
from server import load_routes
from pathlib import Path
routes = load_routes(Path('d4.txt'))
print(f'Loaded {len(routes)} routes')
for path in routes:
    print(f'  {path}')
"
```

This diagnostic toolkit provides comprehensive testing capabilities for the Stack Expert ecosystem, enabling thorough validation of SSL connections, API endpoints, and performance characteristics.