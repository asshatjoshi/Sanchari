// Solenoid lock driven through a logic-level MOSFET.
#pragma once

namespace lock {

void begin();  // always boots locked
void unlock();
void lock();
bool isUnlocked();
const char* stateName();  // "locked" / "unlocked"

}  // namespace lock
