# STKXP API Diagnostics

A collection of diagnostic tools and mock servers for testing Stack Expert API integrations, SSL certificate validation, and system monitoring endpoints.

## 🔧 Tools Overview

### Core Diagnostic Servers

1. **Dynamic API Server** (`server.py`) - FastAPI-based dynamic endpoint generator
2. **Apache Metrics Simulator** (`apache-http.js`) - Mock Apache server with realistic metrics
3. **MySQL Connection Tester** (`mysql.js`) - Database connectivity diagnostics

## 🚀 Quick Start

### Prerequisites

- Python 3.8+ with FastAPI and uvicorn
- Node.js 18+ for Apache simulator
- SSL certificates (for HTTPS endpoints)

### Installation

```bash
cd /root/stkxp-api-diagnostics

# Python dependencies (for server.py)
pip install fastapi uvicorn json5

# Node.js dependencies (for apache-http.js)
npm init -y
npm install express prom-client
```

## 🌟 Features

### Dynamic API Server (`server.py`)

**Purpose**: Dynamically generates API endpoints from configuration files

**Key Features**:
- **Dynamic route generation** from text-based configuration files
- **JSON5 support** for flexible configuration syntax
- **HTTPS with SSL certificates** for secure testing
- **Automatic error handling** and logging
- **Route validation** and conflict resolution

**Usage**:
```bash
# Start the dynamic API server
python server.py

# Server runs on https://0.0.0.0:8443
# Routes loaded from d4.txt configuration file
```

**Configuration Format** (d4.txt):
```
# 1: GET /api/endpoint1 200 OK
{
  "status": "success",
  "data": { ... }
}

# 2: GET /api/endpoint2 200 OK  
{
  "message": "Hello World"
}
```

### Apache Metrics Simulator (`apache-http.js`)

**Purpose**: Simulates realistic Apache HTTP server metrics for testing

**Key Features**:
- **Realistic traffic simulation** with Gaussian noise
- **Multiple endpoint formats** (JSON, mod_status, Prometheus)
- **Dynamic state management** with realistic fluctuations
- **Virtual host support** with separate metrics
- **Load spike simulation** and error generation

**Endpoints**:
```bash
# Detailed JSON status
GET /api/status

# mod_status compatible output
GET /server-status?auto

# Prometheus metrics
GET /metrics

# Administrative controls
POST /admin/set
```

**Environment Configuration**:
```bash
PORT=8080                    # Server port (default: 8080)
HOST=0.0.0.0                # Bind address
INIT_REQ_PER_SEC=50         # Initial requests per second
```

**Usage**:
```bash
# Start Apache simulator
node apache-http.js

# Server runs on http://0.0.0.0:8080
# Access different metric formats via endpoints
```

### MySQL Connection Tester (`mysql.js`)

**Purpose**: Database connectivity diagnostics and testing

**Features**:
- **Connection validation** with detailed error reporting
- **Query execution testing** for common operations  
- **Performance metrics** and latency measurements
- **SSL/TLS connection support**

## 🔒 SSL Certificate Support

The diagnostic tools support SSL/TLS encryption:

### Certificate Structure
```
certificates/
├── ca-8/
│   └── ca.crt              # Certificate Authority
└── kib002/
    ├── kib002.crt          # Server certificate
    └── kib002.key          # Private key
```

### HTTPS Configuration
```python
# server.py SSL configuration
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

## 📊 Monitoring and Metrics

### Apache Metrics Simulation

The Apache simulator provides realistic metrics including:

| Metric | Description |
|--------|-------------|
| `req_per_sec` | Requests per second with noise |
| `bytes_per_sec` | Data transfer rate |
| `cpu_load` | CPU utilization (0.01-0.99) |
| `active_workers` | Active worker processes |
| `idle_workers` | Idle worker processes |
| `total_accesses` | Cumulative request count |
| `errors_total` | Error count with realistic fluctuation |

### Prometheus Integration

```bash
# Access Prometheus metrics
curl http://localhost:8080/metrics

# Sample metrics output
apache_fake_requests_per_second 45.23
apache_fake_total_accesses 12453
apache_fake_cpu_load 0.156
apache_fake_active_workers 8
apache_fake_idle_workers 42
```

## 🛠️ Development and Testing

### Dynamic API Development

**Adding New Routes**:
1. Edit `d4.txt` configuration file
2. Add route definition with JSON payload
3. Restart server.py to load new routes

**Route Format**:
```
# Route ID: GET /path/to/endpoint STATUS_CODE
{
  "endpoint_specific": "payload",
  "dynamic": true
}
```

### Apache Simulation Tuning

**Runtime Configuration**:
```bash
# Adjust traffic parameters
curl -X POST http://localhost:8080/admin/set \
  -H "Content-Type: application/json" \
  -d '{
    "req_per_sec": 100,
    "cpu_load": 0.75,
    "active_workers": 15
  }'
```

**Traffic Patterns**:
- **Normal operation**: Gaussian noise around baseline
- **Traffic spikes**: 2% probability of 4x traffic increase  
- **Outages**: 1% probability of traffic drops
- **Error simulation**: CPU-dependent error rate

## 🔍 Diagnostic Use Cases

### Stack Expert Integration Testing

1. **API Endpoint Validation**
   - Test route generation against mock endpoints
   - Validate SSL certificate handling
   - Check error handling and timeouts

2. **Metrics Collection Testing**  
   - Simulate Apache server metrics
   - Test Prometheus scraping integration
   - Validate metric parsing and storage

3. **Database Connectivity**
   - Test MySQL/database connections
   - Validate connection pooling
   - Check SSL/TLS database encryption

### Performance Testing

1. **Load Simulation**
   - Generate realistic traffic patterns
   - Test API performance under load
   - Validate scaling behavior

2. **Error Handling**
   - Simulate various error conditions
   - Test retry mechanisms
   - Validate error reporting

## 🚨 Troubleshooting

### Common Issues

**SSL Certificate Errors**:
```bash
# Verify certificate files exist
ls -la /root/docker/diagnostics/certificates/

# Check certificate validity
openssl x509 -in kib002.crt -text -noout
```

**Port Binding Issues**:
```bash
# Check port availability
netstat -tulpn | grep :8443

# Use different port if needed
PORT=8444 python server.py
```

**Route Loading Failures**:
```bash
# Check d4.txt format
python -c "import json; json.loads(open('d4.txt').read())"

# Validate JSON syntax
python -m json.tool payload.json
```

### Logging and Debug

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG
python server.py

# Monitor access logs
tail -f /var/log/diagnostics/access.log

# Check error logs
tail -f /var/log/diagnostics/error.log
```

## 📈 Performance Monitoring

### Resource Usage
- **Memory**: ~50MB per diagnostic server
- **CPU**: <5% under normal load
- **Disk**: Minimal (logs and certificates)
- **Network**: Configurable based on simulation

### Scalability
- **Concurrent connections**: 1000+ (FastAPI/Express)
- **Request throughput**: 10,000+ req/sec simulated
- **Route capacity**: Unlimited dynamic routes

## 🔧 Configuration

### Environment Variables

```bash
# Dynamic API Server
export PORT=8443
export HOST=0.0.0.0
export SSL_CERT_PATH=/root/docker/diagnostics/certificates

# Apache Simulator  
export APACHE_PORT=8080
export INIT_REQ_PER_SEC=50
export ENABLE_PROMETHEUS=true

# MySQL Diagnostics
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_SSL=true
```

## 📄 File Structure

```
stkxp-api-diagnostics/
├── server.py              # Dynamic API server (FastAPI)
├── apache-http.js          # Apache metrics simulator  
├── mysql.js               # Database connectivity tester
├── d4.txt                 # API route configuration
├── ca-old.txt             # Legacy certificate info
├── ca.txt                 # Certificate authority info
├── bg.txt                 # Background process info
├── venv/                  # Python virtual environment
└── README.md              # This file
```

## 🤝 Integration with Stack Expert

This diagnostics suite integrates with the broader Stack Expert ecosystem:

- **Stack Expert Plugin**: Endpoint testing and validation
- **stkxp-app**: Frontend API testing and development
- **stkxp-backend**: Route generation validation  
- **stkxp-mcp-server**: MCP protocol testing

---

**STKXP API Diagnostics** - Comprehensive testing and diagnostic tools for Stack Expert API development and validation.