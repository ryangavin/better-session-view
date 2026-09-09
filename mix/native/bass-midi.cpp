// One opt-in virtual source. No hardware destinations are opened.
#include <CoreMIDI/CoreMIDI.h>
#include <CoreFoundation/CoreFoundation.h>
#include <sys/select.h>
#include <unistd.h>
#include <chrono>
#include <vector>
#include <algorithm>
#include <sstream>
#include <iostream>
#include <string>

using Clock = std::chrono::steady_clock;
struct Event { Clock::time_point due; int status, pitch, velocity; };
int main() {
  MIDIClientRef client = 0; MIDIEndpointRef source = 0;
  if (MIDIClientCreate(CFSTR("mix[flow] Bass"), nullptr, nullptr, &client) != noErr) return 1;
  if (MIDISourceCreate(client, CFSTR("mix[flow] Bass"), &source) != noErr) { MIDIClientDispose(client); return 2; }
  MIDIObjectSetIntegerProperty(source, kMIDIPropertyUniqueID, 0x4f464253);
  auto send = [&](int status, int pitch, int velocity) {
    MIDIPacketList list; auto packet = MIDIPacketListInit(&list);
    Byte bytes[] = {Byte(status), Byte(pitch), Byte(velocity)};
    if (MIDIPacketListAdd(&list, sizeof(list), packet, 0, 3, bytes)) MIDIReceived(source, &list);
  };
  bool active[16][128] = {};
  std::vector<Event> queue;
  auto clear = [&]() {
    queue.clear();
    for (int c = 0; c < 16; c++) for (int p = 0; p < 128; p++) if (active[c][p]) {
      send(0x80 + c, p, 0); active[c][p] = false;
    }
  };
  std::cout << "ready" << std::endl;
  std::string pending; auto touched = Clock::now(); bool running = true;
  while (running && Clock::now() - touched < std::chrono::seconds(5)) {
    fd_set fds; FD_ZERO(&fds); FD_SET(STDIN_FILENO, &fds);
    timeval wait{0, 1000};
    if (select(STDIN_FILENO + 1, &fds, nullptr, nullptr, &wait) > 0) {
      char bytes[4096]; auto count = read(STDIN_FILENO, bytes, sizeof(bytes));
      if (count <= 0) break;
      pending.append(bytes, count);
      if (pending.size() > 65536) break;
      size_t end;
      while ((end = pending.find('\n')) != std::string::npos) {
        std::istringstream line(pending.substr(0, end)); pending.erase(0, end + 1);
        char op; line >> op; touched = Clock::now();
        if (op == 'q') { running = false; break; }
        if (op == 'c') clear();
        if (op == 'n') {
          int delay, status, pitch, velocity;
          if (!(line >> delay >> status >> pitch >> velocity) || delay < 0 || delay > 600000 || status < 0x80 || status > 0x9f || pitch < 0 || pitch > 127 || velocity < 0 || velocity > 127 || queue.size() >= 4096) { running = false; break; }
          queue.push_back({Clock::now() + std::chrono::milliseconds(delay), status, pitch, velocity});
        }
      }
    }
    std::stable_sort(queue.begin(), queue.end(), [](const Event& a, const Event& b) { return a.due < b.due; });
    const auto now = Clock::now();
    while (!queue.empty() && queue.front().due <= now) {
      const auto e = queue.front(); queue.erase(queue.begin()); send(e.status, e.pitch, e.velocity);
      active[e.status & 15][e.pitch] = (e.status & 0xf0) == 0x90 && e.velocity > 0;
    }
  }
  clear(); MIDIEndpointDispose(source); MIDIClientDispose(client);
}
