#include <unity.h>

#include "geofence.h"

// Square roughly 200 m across (around 12.9716 N, 77.5946 E).
static const LatLng kSquare[] = {
    {12.9706, 77.5936}, {12.9706, 77.5956}, {12.9726, 77.5956}, {12.9726, 77.5936}};
static const LatLng kInside = {12.9716, 77.5946};
static const LatLng kOutside = {12.9750, 77.5946};

// L-shape: the notch at the top right is outside.
static const LatLng kLShape[] = {{0, 0}, {0, 10}, {5, 10}, {5, 5}, {10, 5}, {10, 0}};

void setUp() {}
void tearDown() {}

void test_point_in_square() {
  TEST_ASSERT_TRUE(pointInPolygon(kInside, kSquare, 4));
  TEST_ASSERT_FALSE(pointInPolygon(kOutside, kSquare, 4));
}

void test_point_in_concave_polygon() {
  TEST_ASSERT_TRUE(pointInPolygon({2, 2}, kLShape, 6));
  TEST_ASSERT_TRUE(pointInPolygon({8, 2}, kLShape, 6));
  TEST_ASSERT_FALSE(pointInPolygon({8, 8}, kLShape, 6));
}

void test_degenerate_polygon_is_never_inside() {
  TEST_ASSERT_FALSE(pointInPolygon(kInside, kSquare, 2));
}

void test_exit_needs_consecutive_readings() {
  GeofenceMonitor m(3);
  m.setPolygon(kSquare, 4);
  for (int i = 0; i < 3; i++) m.update(true, kInside);
  TEST_ASSERT_EQUAL(GeofenceMonitor::kInside, m.state());

  TEST_ASSERT_EQUAL(GeofenceMonitor::kNone, m.update(true, kOutside));
  TEST_ASSERT_EQUAL(GeofenceMonitor::kNone, m.update(true, kOutside));
  TEST_ASSERT_EQUAL(GeofenceMonitor::kExited, m.update(true, kOutside));
  TEST_ASSERT_EQUAL(GeofenceMonitor::kNone, m.update(true, kOutside));  // fires once
}

void test_jitter_resets_streak() {
  GeofenceMonitor m(3);
  m.setPolygon(kSquare, 4);
  for (int i = 0; i < 3; i++) m.update(true, kInside);
  m.update(true, kOutside);
  m.update(true, kOutside);
  m.update(true, kInside);  // jitter back inside
  TEST_ASSERT_EQUAL(GeofenceMonitor::kNone, m.update(true, kOutside));
  TEST_ASSERT_EQUAL(GeofenceMonitor::kInside, m.state());
}

void test_no_fix_is_ignored() {
  GeofenceMonitor m(3);
  m.setPolygon(kSquare, 4);
  for (int i = 0; i < 10; i++) {
    TEST_ASSERT_EQUAL(GeofenceMonitor::kNone, m.update(false, kOutside));
  }
  TEST_ASSERT_EQUAL(GeofenceMonitor::kUnknown, m.state());
}

void test_return_after_exit() {
  GeofenceMonitor m(2);
  m.setPolygon(kSquare, 4);
  m.update(true, kOutside);
  TEST_ASSERT_EQUAL(GeofenceMonitor::kExited, m.update(true, kOutside));
  m.update(true, kInside);
  TEST_ASSERT_EQUAL(GeofenceMonitor::kReturned, m.update(true, kInside));
}

void test_first_inside_is_not_a_return() {
  GeofenceMonitor m(1);
  m.setPolygon(kSquare, 4);
  TEST_ASSERT_EQUAL(GeofenceMonitor::kNone, m.update(true, kInside));
}

void test_no_fence_does_nothing() {
  GeofenceMonitor m(1);
  TEST_ASSERT_EQUAL(GeofenceMonitor::kNone, m.update(true, kOutside));
  TEST_ASSERT_FALSE(m.setPolygon(kSquare, 2));
  TEST_ASSERT_FALSE(m.hasFence());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_point_in_square);
  RUN_TEST(test_point_in_concave_polygon);
  RUN_TEST(test_degenerate_polygon_is_never_inside);
  RUN_TEST(test_exit_needs_consecutive_readings);
  RUN_TEST(test_jitter_resets_streak);
  RUN_TEST(test_no_fix_is_ignored);
  RUN_TEST(test_return_after_exit);
  RUN_TEST(test_first_inside_is_not_a_return);
  RUN_TEST(test_no_fence_does_nothing);
  return UNITY_END();
}
