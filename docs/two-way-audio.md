# Two-way audio

[← Back to README](../README.md)

Talk through a camera's speaker: Home Assistant's own two-way audio or a go2rtc backchannel.

## Two-way audio (advanced)

Two-way audio (talkback) lets you speak through a camera's backchannel speaker from the live view. There are two ways to set it up.

### Home Assistant two-way audio (2026.11 and newer, easiest)

Home Assistant 2026.11 can send your microphone to the camera itself. When it does, the card's talk button just works for that camera, with no go2rtc setup.

1. Turn on **Settings → System → Labs → Two-way audio**.
2. Use a camera whose integration supports it. At the time of writing that is Matter cameras and Reolink. Reolink must use **RTSP** (in the Reolink integration options), because RTMP and FLV can't carry audio back to the camera.
3. Open Home Assistant over **HTTPS**. Browsers only allow the microphone on secure pages.

The talk button appears on every camera for which Home Assistant reports two-way audio and that has no go2rtc mic stream set below. Toggle / push-to-talk and the button shape work the same. To turn it off, set `live_native_talk: false` (or switch off **Home Assistant two-way audio** in the editor's Two-way audio section).

### go2rtc backchannel (any version)

Setup is more involved than the rest of the card. A go2rtc mic stream set for a camera takes priority over Home Assistant's own two-way audio.

**You need:**

- A camera with an **audio backchannel speaker** (most Reolink doorbells, some Hikvision, Tapo, etc.).
- The [AlexxIT/WebRTC](https://github.com/AlexxIT/WebRTC) HACS integration — provides the signed `/api/webrtc/ws` endpoint the card connects to.
- A go2rtc `streams:` entry that routes the camera's backchannel audio.

**Configuration:**

- `mic: <go2rtc_stream_key>` on a camera in [`live_cameras`](live-view.md#live-cameras) — the go2rtc stream that carries that camera's backchannel. The mic pill appears only on cameras with a `mic`. You can also set it in the editor under **Live → Two-way audio**.
- Optional `live_mic_mode: ptt` for push-to-talk (default is tap-to-toggle).
- Optional `live_mic_audio_processing` to tweak echo cancellation, noise suppression, AGC.
- Optional `live_mic_ice_servers` / `live_mic_force_relay` if you're behind symmetric NAT and need a TURN relay.

**Visual states:** the pill cycles through four states — idle, connecting, active, error — and announces them to screen readers. Transient WebSocket glitches retry automatically.

**Custom TURN (Coturn) for symmetric NAT.** Default is STUN-only — voice traffic stays direct on your LAN. If you need a relay (e.g. talking to a Tailscale endpoint from a flaky cellular network):

```yaml
live_mic_ice_servers:
  - urls: stun:stun.cloudflare.com:3478
  - urls:
      - turn:turn.example.com:3478
      - turns:turn.example.com:5349
    username: your_username
    credential: your_secret
# live_mic_force_relay: true   # only if direct ICE never succeeds
```

Older configs set the mic streams in a separate `live_mic_streams` map. That still works and is converted into `mic` on each camera when the card loads.

See the [Two-way audio YAML example](#two-way-audio-talkback) for a working config.

---

#### Two-way audio (talkback)

Multi-camera setup with mic on the two cameras that actually have speakers:

```yaml
type: custom:camera-gallery-card
source_mode: media
live_enabled: true
live_cameras:
  - entity: camera.front_door # mic-capable doorbell
    mic: front_door # go2rtc streams: key
  - entity: camera.driveway # mic-capable PTZ
    mic: driveway
  - entity: camera.backyard # no speaker, so no mic
live_mic_mode: ptt # press-and-hold; omit for tap-to-toggle
```

See [Two-way audio (advanced)](#two-way-audio-advanced) for prerequisites and TURN setup.
