# ShadowProtocol

## Prerequisites

### Get NVIDIA API Key

1. Get your API key from [NVIDIA NIM](https://build.nvidia.com/)
2. Copy your API key

## Setup

### 1. Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your API key:

```env
NVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=qwen/qwen3.5-397b-a17b
```

