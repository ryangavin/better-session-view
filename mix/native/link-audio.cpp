// SPDX-License-Identifier: GPL-2.0-or-later
// A private pipe adapter for Ableton's Link Audio SDK. No audio device, UI, or file access.
#include <ableton/LinkAudio.hpp>
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <deque>
#include <iostream>
#include <iomanip>
#include <cmath>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--version") {
    std::cout << "openflow-link-audio 2\n";
    return 0;
  }
  if (argc < 4 || argc > 19) return 2;
  try {
    const double initialTempo = std::stod(argv[2]);
    if (!std::isfinite(initialTempo) || initialTempo < 20 || initialTempo > 999) return 2;
    ableton::LinkAudio link(initialTempo, argv[1]);
    std::vector<std::unique_ptr<ableton::LinkAudioSink>> sinks;
    for (int i = 3; i < argc; ++i)
      sinks.emplace_back(std::make_unique<ableton::LinkAudioSink>(link, argv[i], 2048));
    link.enable(true);
    link.enableLinkAudio(true);
    link.enableStartStopSync(true);
    std::cout << std::setprecision(17);
    // A snapshot is captured before the worklet renders with its token. Retain it
    // until that block arrives, so a tempo/session change cannot retime older audio.
    struct Snapshot { uint64_t token; ableton::LinkAudio::SessionState state; };
    std::deque<Snapshot> snapshots;
    std::vector<int16_t> samples(sinks.size() * 2048);
    std::cout << "ready\n" << std::flush;
    std::string line;
    while (std::getline(std::cin, line)) {
      std::istringstream input(line);
      char kind; uint64_t request;
      if (!(input >> kind >> request)) return 2;
      if (kind == 'c' || kind == 't' || kind == 's' || kind == 'p' || kind == 'q') {
        auto state = link.captureAppSessionState();
        const auto now = link.clock().micros();
        int64_t startMicros = 0;
        if (kind == 't') {
          double bpm;
          if (!(input >> bpm) || !std::isfinite(bpm) || bpm < 20 || bpm > 999) return 2;
          state.setTempo(bpm, now);
        } else if (kind == 's') {
          state.setIsPlaying(false, now);
        } else if (kind == 'p' || kind == 'q') {
          double beat; int64_t micros;
          if (!(input >> beat >> micros) || !std::isfinite(beat)) return 2;
          const auto earliest = std::chrono::microseconds(std::max(micros, now.count() + 50000));
          if (kind == 'p') state.setIsPlayingAndRequestBeatAtTime(true, earliest, beat, 4);
          else state.requestBeatAtTime(beat, earliest, 4);
          startMicros = state.timeAtBeat(beat, 4).count();
        }
        if (kind != 'c') link.commitAppSessionState(state);
        snapshots.push_back({request, state});
        if (snapshots.size() > 64) snapshots.pop_front();
        std::cout << "c " << request << ' ' << now.count() << ' '
                  << state.tempo() << ' ' << link.numPeers() << ' ' << state.beatAtTime(now, 4) << ' '
                  << state.isPlaying() << ' ' << state.timeForIsPlaying().count() << ' '
                  << startMicros << '\n' << std::flush;
      } else if (kind == 'a') {
        uint64_t token; int64_t micros; size_t frames; uint32_t rate;
        if (!(input >> token >> micros >> frames >> rate) || frames != 1024
            || rate < 8000 || rate > 192000) return 2;
        const auto bytes = sinks.size() * frames * 2 * sizeof(int16_t);
        if (!std::cin.read(reinterpret_cast<char*>(samples.data()), bytes)) return 2;
        auto snapshot = std::find_if(snapshots.begin(), snapshots.end(),
          [token](const auto& s) { return s.token == token; });
        size_t sent = 0;
        const auto age = link.clock().micros().count() - micros;
        if (snapshot != snapshots.end() && age >= -500000 && age <= 500000) {
          const auto beat = snapshot->state.beatAtTime(std::chrono::microseconds(micros), 4);
          for (size_t i = 0; i < sinks.size(); ++i) {
            ableton::LinkAudioSink::BufferHandle buffer(*sinks[i]);
            if (!buffer) continue; // No subscriber, or the SDK's bounded queue is full.
            std::copy_n(samples.data() + i * frames * 2, frames * 2, buffer.samples);
            if (buffer.commit(snapshot->state, beat, 4, frames, 2, rate)) ++sent;
          }
        }
        std::cout << "a " << request << ' ' << sent << '\n' << std::flush;
      } else return 2;
    }
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
