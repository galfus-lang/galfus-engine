/// Generates a valid in-memory PCM 16-bit Mono WAV audio buffer.
///
/// Produces a pleasant synthetic sine wave beep with a soft decay envelope.
pub fn generate_synthetic_beep(frequency: f32, duration_secs: f32, sample_rate: u32) -> Vec<u8> {
    let num_samples = (sample_rate as f32 * duration_secs) as usize;
    let data_len = (num_samples * 2) as u32; // 16-bit mono = 2 bytes per sample
    let mut wav = Vec::with_capacity(44 + data_len as usize);

    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    // fmt subchunk (PCM)
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // Subchunk1Size (16 for PCM)
    wav.extend_from_slice(&1u16.to_le_bytes()); // AudioFormat (1 = PCM)
    wav.extend_from_slice(&1u16.to_le_bytes()); // NumChannels (1 = Mono)
    wav.extend_from_slice(&sample_rate.to_le_bytes()); // SampleRate
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // ByteRate
    wav.extend_from_slice(&2u16.to_le_bytes()); // BlockAlign
    wav.extend_from_slice(&16u16.to_le_bytes()); // BitsPerSample (16)

    // data subchunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());

    for i in 0..num_samples {
        let t = i as f32 / sample_rate as f32;
        let progress = i as f32 / num_samples as f32;
        let envelope = (1.0 - progress).powf(0.6); // smooth exponential falloff
        let sample = (t * frequency * 2.0 * std::f32::consts::PI).sin() * envelope;
        let sample_i16 = (sample * 0.4 * i16::MAX as f32) as i16;
        wav.extend_from_slice(&sample_i16.to_le_bytes());
    }

    wav
}

