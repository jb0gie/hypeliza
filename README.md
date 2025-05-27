# Eliza x Hyperfy Agent

This project wraps some plugin development of a Hyperfy client that allows Eliza to connect to a Hyperfy world like a user. In the future, the Hyperfy portion may be broken out and published as a separate plugin — for now, it's included here.

## 💠 Getting Started

### 1. Clone the project

Clone this repository using:

```bash
git clone --recurse-submodules https://github.com/elizaOS/eliza-3d-hyperfy-starter.git
```

### 2. Setup environment variables

Copy the example environment file and rename it:

```bash
cp .env.example .env
```

Edit the `.env` file and fill in the necessary values.

#### Notes on `.env` settings:

* `WS_URL`: WebSocket URL for connecting to a Hyperfy world.

  * Default: `wss://chill.hyperfy.xyz/ws` (our public world)
  * To connect to your own local world:

    1. Clone and run Hyperfy: [https://github.com/hyperfy-xyz/hyperfy](https://github.com/hyperfy-xyz/hyperfy)
    2. If it runs on port `3000`, set:

       ```env
       WS_URL=ws://localhost:3000/ws
       ```

* `SERVER_PORT`: The port this app will run on (e.g., `3001`, `4000`, etc.)

### 3. Run the project

Use your preferred package manager:

```bash
bun install
bun install # run twice to ensure postinstall scripts run correctly
bun run build
bun run dev
```

---

## 🗣️ Optional: Enable Voice Chat

You can optionally enable voice chat support via one of the following methods:

### Option 1: ElevenLabs

1. Set ElevenLabs-related variables in `.env`:

   * `ELEVENLABS_XI_API_KEY`
   * `ELEVENLABS_MODEL_ID`
   * `ELEVENLABS_VOICE_ID`
   * etc.

2. Add the ElevenLabs plugin to your character settings file.

### Option 2: OpenAI

1. Set the `OPENAI_API_KEY` in `.env`.
2. Configure your character to use OpenAI's voice features.

---

Feel free to open issues or contribute if you're building something cool with Eliza and Hyperfy!
