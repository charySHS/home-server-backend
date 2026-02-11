# Home Server Backend

Self-hosted file transfer server with resumable chunk uploads and streaming downloads.

## Alpha Features (v0.1.0-alpha)

- Chunked uploads
- Resume support
- Disk-backed persistence
- Atomic chunk writes
- Finalization step
- Streaming downloads
- HTTP Range support
- LAN-based cross-device transfer
- Dedicated storage root (e.g. D:\HomeServer)

## API Endpoints

### Initialize Upload
POST /api/v1/uploads/init

### Upload Chunk
POST /api/v1/uploads/chunk

Headers:
- x-upload-id
- x-chunk-index

### Finalize Upload
POST /api/v1/uploads/finalize

### Upload Status
GET /api/v1/uploads/status

### Download File
GET /api/v1/files/:fileName

Supports:
- Full download
- HTTP Range requests

## Storage Layout

D:\HomeServer\
├── data\
├── uploads\

## Next (Beta Goals)

- Device pairing / authentication
- Parallel chunk uploads
- File listing API
- Web client
- Background uploads