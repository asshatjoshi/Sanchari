#include "lock.h"

#include <Arduino.h>

#include "config.h"

namespace lock {
namespace {

bool unlocked = false;

void apply() {
  bool energise = LOCK_ENERGISED_UNLOCKS ? unlocked : !unlocked;
  digitalWrite(PIN_LOCK, energise ? HIGH : LOW);
}

}  // namespace

void begin() {
  pinMode(PIN_LOCK, OUTPUT);
  unlocked = false;
  apply();
}

void unlock() {
  unlocked = true;
  apply();
  Serial.println("[lock] unlocked");
}

void lock() {
  unlocked = false;
  apply();
  Serial.println("[lock] locked");
}

bool isUnlocked() { return unlocked; }

const char* stateName() { return unlocked ? "unlocked" : "locked"; }

}  // namespace lock
