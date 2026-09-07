// Read Core Audio output capabilities without opening, starting, or configuring a device.
#import <Foundation/Foundation.h>
#include <CoreAudio/CoreAudio.h>
#include <vector>
#include <stdexcept>

static AudioObjectPropertyAddress address(AudioObjectPropertySelector selector,
    AudioObjectPropertyScope scope = kAudioObjectPropertyScopeGlobal) {
  return {selector, scope, kAudioObjectPropertyElementMain};
}
template<class T> static std::vector<T> values(AudioObjectID object, AudioObjectPropertyAddress property) {
  UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(object, &property, 0, nullptr, &size) != noErr)
    throw std::runtime_error("Cannot read audio device capabilities");
  std::vector<T> result((size + sizeof(T) - 1) / sizeof(T));
  if (size && AudioObjectGetPropertyData(object, &property, 0, nullptr, &size, result.data()) != noErr)
    throw std::runtime_error("Audio device changed during discovery");
  result.resize(size / sizeof(T));
  return result;
}
int main() {
  @autoreleasepool {
    try {
      auto defaults = values<AudioDeviceID>(kAudioObjectSystemObject, address(kAudioHardwarePropertyDefaultOutputDevice));
      auto devices = values<AudioDeviceID>(kAudioObjectSystemObject, address(kAudioHardwarePropertyDevices));
      NSMutableArray *outputs = [NSMutableArray array];
      for (auto device : devices) {
        try {
          auto streams = values<AudioStreamID>(device, address(kAudioDevicePropertyStreams, kAudioDevicePropertyScopeOutput));
          if (streams.empty()) continue;
          auto names = values<CFStringRef>(device, address(kAudioObjectPropertyName));
          if (names.empty()) continue;
          NSString *name = CFBridgingRelease(names.front());
          auto rates = values<AudioValueRange>(device, address(kAudioDevicePropertyAvailableNominalSampleRates));
          NSMutableArray *ranges = [NSMutableArray array];
          for (auto rate : rates) if (rate.mMinimum > 0 && rate.mMaximum >= rate.mMinimum)
            [ranges addObject:@{@"min": @(rate.mMinimum), @"max": @(rate.mMaximum)}];
          [outputs addObject:@{@"name": name, @"isDefault": @(!defaults.empty() && device == defaults.front()), @"rates": ranges}];
        } catch (const std::exception &) { /* A disappearing device must not discard the others. */ }
      }
      NSData *json = [NSJSONSerialization dataWithJSONObject:outputs options:0 error:nil];
      if (!json) return 1;
      fwrite(json.bytes, 1, json.length, stdout);
      return 0;
    } catch (const std::exception &error) {
      fprintf(stderr, "%s\n", error.what()); return 1;
    }
  }
}
