// SPDX-License-Identifier: GPL-2.0-or-later
// A real SDK receiver for the publisher's integration check. Never used by the app.
#include <ableton/LinkAudio.hpp>
#include <atomic>
#include <chrono>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

int main(int argc, char** argv) {
  if (argc < 2) return 2;
  ableton::LinkAudio link(120, "mix Link Audio check");
  link.enable(true);
  link.enableLinkAudio(true);
  const size_t count = argc - 1;
  std::vector<std::unique_ptr<ableton::LinkAudioSource>> sources(count);
  std::vector<std::atomic<size_t>> received(count);
  std::atomic<bool> wrong{false};
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(12);
  while (std::chrono::steady_clock::now() < deadline) {
    for (const auto& channel : link.channels()) {
      for (size_t i = 0; i < count; ++i) {
        if (channel.peerName != "mix[flow]" || channel.name != argv[i + 1] || sources[i]) continue;
        sources[i] = std::make_unique<ableton::LinkAudioSource>(link, channel.id,
          [&, i](ableton::LinkAudioSource::BufferHandle buffer) {
            if (buffer.info.numChannels != 2 || buffer.info.sampleRate != 48000) { wrong = true; return; }
            for (size_t frame = 0; frame < buffer.info.numFrames; ++frame) {
              if (buffer.samples[frame * 2] != (i + 1) * 1000
                  || buffer.samples[frame * 2 + 1] != -static_cast<int>((i + 1) * 1000)) wrong = true;
            }
            const auto state = link.captureAppSessionState();
            if (!buffer.info.beginBeats(state, 4).has_value()) wrong = true;
            received[i] += buffer.info.numFrames;
          });
      }
    }
    bool complete = true;
    for (const auto& frames : received) if (frames.load() < 4096) complete = false;
    if (wrong) { std::cerr << "Incorrect channels, PCM, rate, or timeline\n"; return 1; }
    if (complete) { std::cout << "Verified " << count << " independent stereo streams\n"; return 0; }
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
  std::cerr << "Timed out discovering or receiving streams\n";
  return 1;
}
