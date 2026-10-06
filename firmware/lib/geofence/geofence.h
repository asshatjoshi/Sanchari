// Geofence logic with no Arduino dependencies, so it can be unit-tested on a PC
// (`pio test -e native`).
#pragma once

#include <stddef.h>

struct LatLng {
  double lat;
  double lng;
};

// Ray-casting point-in-polygon test. Treats lat/lng as planar coordinates,
// which is accurate enough for an area the size of a mall.
bool pointInPolygon(const LatLng& p, const LatLng* poly, size_t n);

class GeofenceMonitor {
 public:
  static const size_t kMaxPoints = 64;

  enum State { kUnknown, kInside, kOutside };
  enum Event { kNone, kExited, kReturned };

  // `threshold` = consecutive readings on the other side of the fence needed
  // before the state flips. Stops GPS jitter near the boundary from toggling it.
  explicit GeofenceMonitor(int threshold = 3) : threshold_(threshold) {}

  // Copies the polygon. Returns false (and clears the fence) if n < 3 or too many points.
  bool setPolygon(const LatLng* poly, size_t n);
  void clear();
  bool hasFence() const { return count_ >= 3; }

  // Feed one GPS reading. Readings without a valid fix are ignored entirely:
  // indoors the GPS rarely has a fix, and "no fix" must never trigger a lock.
  Event update(bool validFix, const LatLng& p);

  State state() const { return state_; }

 private:
  LatLng points_[kMaxPoints];
  size_t count_ = 0;
  int threshold_;
  State state_ = kUnknown;
  int outsideStreak_ = 0;
  int insideStreak_ = 0;
};
