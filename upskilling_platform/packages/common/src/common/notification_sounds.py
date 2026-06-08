"""Default notification sound assets stored in MinIO."""

import math
import struct
import wave
from io import BytesIO

from common.storage import file_exists, get_minio_client, upload_file

NOTIFICATION_SOUND_BUCKET = "notification-assets"
NOTIFICATION_SOUND_PREFIX = "sounds"

NOTIFICATION_SOUND_OBJECTS = {
    "achievement": f"{NOTIFICATION_SOUND_PREFIX}/achievement.wav",
    "progress": f"{NOTIFICATION_SOUND_PREFIX}/progress.wav",
    "course": f"{NOTIFICATION_SOUND_PREFIX}/course.wav",
    "reminder": f"{NOTIFICATION_SOUND_PREFIX}/reminder.wav",
    "team": f"{NOTIFICATION_SOUND_PREFIX}/team.wav",
}


def _tone_wav(frequencies: list[float], duration: float = 0.42) -> bytes:
    sample_rate = 44100
    amplitude = 0.32
    samples_per_tone = max(1, int(sample_rate * duration / len(frequencies)))
    buffer = BytesIO()

    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)

        for frequency in frequencies:
            for sample_index in range(samples_per_tone):
                fade_in = min(sample_index / max(sample_rate * 0.025, 1), 1)
                fade_out = min((samples_per_tone - sample_index) / max(sample_rate * 0.045, 1), 1)
                envelope = min(fade_in, fade_out)
                value = amplitude * envelope * math.sin(
                    2 * math.pi * frequency * (sample_index / sample_rate)
                )
                wav.writeframes(struct.pack("<h", int(value * 32767)))

    return buffer.getvalue()


def ensure_notification_sounds() -> dict[str, str]:
    """Upload default short WAV notification sounds to MinIO if missing."""
    client = get_minio_client()
    sound_specs = {
        "achievement": [659.25, 783.99, 987.77],
        "progress": [523.25, 659.25],
        "course": [440.0, 587.33],
        "reminder": [392.0, 392.0, 493.88],
        "team": [493.88, 659.25, 739.99],
    }

    uploaded: dict[str, str] = {}
    for sound_name, frequencies in sound_specs.items():
        object_name = NOTIFICATION_SOUND_OBJECTS[sound_name]
        if not file_exists(NOTIFICATION_SOUND_BUCKET, object_name, client):
            upload_file(
                NOTIFICATION_SOUND_BUCKET,
                object_name,
                _tone_wav(frequencies),
                content_type="audio/wav",
                client=client,
            )
        uploaded[sound_name] = object_name

    return uploaded
