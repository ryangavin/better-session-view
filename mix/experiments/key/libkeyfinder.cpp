// Experimental adapter only; linked locally to GPL-3.0-or-later libkeyfinder.
#include <keyfinder/keyfinder.h>
#include <fstream>
#include <iostream>
#include <cmath>
#include <string>
int main(int argc, char** argv) {
  if (argc == 2 && std::string(argv[1]) == "--version") { std::cout << "2.2.8"; return 0; }
  if (argc != 2) return 2;
  try {
    std::ifstream input(argv[1], std::ios::binary | std::ios::ate);
    if (!input) throw std::runtime_error("Cannot read mono float32 PCM");
    auto bytes = input.tellg();
    if (bytes <= 0 || bytes % 4 != 0) throw std::runtime_error("Empty or incomplete PCM");
    input.seekg(0);
    KeyFinder::AudioData audio;
    audio.setFrameRate(44100); audio.setChannels(1); audio.addToSampleCount(bytes / 4);
    for (unsigned int i = 0; i < audio.getSampleCount(); ++i) {
      float sample; input.read(reinterpret_cast<char*>(&sample), 4);
      if (!std::isfinite(sample)) throw std::runtime_error("Non-finite PCM");
      audio.setSample(i, sample);
    }
    KeyFinder::KeyFinder detector;
    const char* labels[] = {"A major","A minor","Bb major","Bb minor","B major","B minor","C major","C minor","Db major","Db minor","D major","D minor","Eb major","Eb minor","E major","E minor","F major","F minor","Gb major","Gb minor","G major","G minor","Ab major","Ab minor","Unknown"};
    int result = static_cast<int>(detector.keyOfAudio(audio));
    if (result < 0 || result > 24) throw std::runtime_error("Invalid key enum");
    std::cout << "{\"label\":\"" << labels[result] << "\",\"score\":null}";
  } catch (const std::exception& e) { std::cerr << e.what(); return 1; }
}
