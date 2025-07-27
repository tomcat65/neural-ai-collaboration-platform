#!/bin/sh

echo "🚀 Starting Multi-Agent Platform..."

# Create logs directory
mkdir -p /app/logs

# Start Memory Server (Background)
echo "📦 Starting Memory HTTP Server on port 3000..."
node dist/http-server.js > /app/logs/memory-server.log 2>&1 &
MEMORY_PID=$!

# Wait for Memory Server to be ready
echo "⏳ Waiting for Memory Server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Memory Server ready"
    break
  fi
  sleep 2
done

# Start ANP Router (Background)
echo "🔗 Starting ANP Router on ports 8081/8082..."
node dist/anp-router.js > /app/logs/anp-router.log 2>&1 &
ANP_PID=$!

# Wait for ANP Router to be ready
echo "⏳ Waiting for ANP Router..."
for i in $(seq 1 30); do
  if curl -s http://localhost:8081/ > /dev/null 2>&1; then
    echo "✅ ANP Router ready"
    break
  fi
  sleep 2
done

# Start Mock API Server (Background)
echo "🔧 Starting Mock API Server on port 3001..."
node simple-mock-server.cjs > /app/logs/mock-api.log 2>&1 &
MOCK_PID=$!

# Wait for Mock API Server to be ready
echo "⏳ Waiting for Mock API Server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Mock API Server ready"
    break
  fi
  sleep 2
done

# Start Observatory Dashboard (Foreground)
echo "🎆 Starting Multi-Agent Observatory on port 5174..."

# Use serve for static file serving with proxying
serve -s /app/ui/dist -l 5174 &
DASHBOARD_PID=$!

# Wait for Dashboard to be ready
echo "⏳ Waiting for Observatory Dashboard..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5174 > /dev/null 2>&1; then
    echo "✅ Observatory Dashboard ready"
    break
  fi
  sleep 2
done

echo "🎉 Multi-Agent Platform fully operational!"
echo "🌐 Access Observatory at: http://localhost:5174"
echo "📊 Memory Server: http://localhost:3000"
echo "🔗 ANP Router: http://localhost:8083"
echo "🔧 Mock API: http://localhost:3001"

# Cleanup function
cleanup() {
  echo "🛑 Shutting down Multi-Agent Platform..."
  kill $MEMORY_PID $ANP_PID $MOCK_PID $DASHBOARD_PID 2>/dev/null
  exit 0
}

# Handle shutdown signals
trap cleanup SIGTERM SIGINT

# Keep the script running and monitor services
while true; do
  sleep 10
  
  # Check if any service died
  if ! kill -0 $MEMORY_PID 2>/dev/null; then
    echo "❌ Memory Server died, restarting..."
    node dist/http-server.js > /app/logs/memory-server.log 2>&1 &
    MEMORY_PID=$!
  fi
  
  if ! kill -0 $ANP_PID 2>/dev/null; then
    echo "❌ ANP Router died, restarting..."
    node dist/anp-router.js > /app/logs/anp-router.log 2>&1 &
    ANP_PID=$!
  fi
  
  if ! kill -0 $MOCK_PID 2>/dev/null; then
    echo "❌ Mock API Server died, restarting..."
    node simple-mock-server.cjs > /app/logs/mock-api.log 2>&1 &
    MOCK_PID=$!
  fi
  
  if ! kill -0 $DASHBOARD_PID 2>/dev/null; then
    echo "❌ Dashboard died, restarting..."
    serve -s /app/ui/dist -l 5174 &
    DASHBOARD_PID=$!
  fi
done