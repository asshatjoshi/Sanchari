#include "geofence.h"

bool pointInPolygon(const LatLng& p, const LatLng* poly, size_t n) {
  if (n < 3) return false;
  bool inside = false;
  for (size_t i = 0, j = n - 1; i < n; j = i++) {
    const LatLng& a = poly[i];
    const LatLng& b = poly[j];
    if ((a.lat > p.lat) != (b.lat > p.lat) &&
        p.lng < (b.lng - a.lng) * (p.lat - a.lat) / (b.lat - a.lat) + a.lng) {
      inside = !inside;
    }
  }
  return inside;
}

bool GeofenceMonitor::setPolygon(const LatLng* poly, size_t n) {
  clear();
  if (n < 3 || n > kMaxPoints) return false;
  for (size_t i = 0; i < n; i++) points_[i] = poly[i];
  count_ = n;
  return true;
}

void GeofenceMonitor::clear() {
  count_ = 0;
  state_ = kUnknown;
  outsideStreak_ = 0;
  insideStreak_ = 0;
}

GeofenceMonitor::Event GeofenceMonitor::update(bool validFix, const LatLng& p) {
  if (!validFix || !hasFence()) return kNone;

  if (pointInPolygon(p, points_, count_)) {
    outsideStreak_ = 0;
    if (insideStreak_ < threshold_) insideStreak_++;
    if (insideStreak_ >= threshold_ && state_ != kInside) {
      State prev = state_;
      state_ = kInside;
      return prev == kOutside ? kReturned : kNone;
    }
  } else {
    insideStreak_ = 0;
    if (outsideStreak_ < threshold_) outsideStreak_++;
    if (outsideStreak_ >= threshold_ && state_ != kOutside) {
      state_ = kOutside;
      return kExited;
    }
  }
  return kNone;
}
